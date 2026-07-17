import { randomUUID } from 'node:crypto';
import type { AdapterRegistry } from '../adapters/adapterRegistry';
import type { BookHandle, PreviewImagePayload, SafeSectionDocument, SectionRef } from '../adapters/bookAdapter';
import type { BookRecord } from '../domain/books';
import { clampBackwardToGraphemeBoundary } from '../domain/immersivePaginator';
import { mapImmersiveOffsetToSource, mapSourceOffsetToImmersive } from '../domain/immersiveProjection';
import { mapLocatorToBookProgression, openBook as createReaderState, type ReaderEngineState } from '../domain/readerEngine';
import type { EpubLocator, ReadingLocator, ReadingPosition, TxtLocator } from '../domain/locators';
import type { BookLibraryStore } from '../storage/bookLibraryStore';
import type { ReadingProgressStore } from '../storage/readingProgressStore';
import { READER_PROTOCOL_VERSION, type ExtensionToReaderV2Message } from './readerMessages';
import type { ImmersiveReaderPresenter, ReaderPresentationMode } from './readerPresenter';

export interface ReaderSessionCoordinatorOptions {
  createRequestId?: () => string;
  debounceMs?: number;
  now?: () => number;
  openImagePreview?: (payload: PreviewImagePayload) => boolean | PromiseLike<boolean>;
  showInformation?: (message: string) => void | PromiseLike<void>;
  setImmersiveContext?: (active: boolean) => void | PromiseLike<void>;
  preflight?: (book: BookRecord) => boolean | PromiseLike<boolean>;
}

export interface ReaderSessionSnapshot {
  bookId: string;
  mode: ReaderPresentationMode;
  state: 'opening' | 'active' | 'switching' | 'stopping';
  sectionId?: string;
}

export interface ImmersiveStopResult {
  stopped: boolean;
  progressPersisted: boolean;
}

export interface ReaderImageRequest {
  requestId: string;
  bookId: string;
  sectionId: string;
  sectionGeneration: number;
  resourceId: string;
}

export class ReaderSessionCoordinator {
  private handle?: BookHandle;
  private engine?: ReaderEngineState;
  private book?: BookRecord;
  private sections: SectionRef[] = [];
  private currentSection?: SafeSectionDocument;
  private currentSectionIndex = -1;
  private activeResources = new Set<string>();
  private requestId = '';
  private sectionGeneration = 0;
  private mode?: ReaderPresentationMode;
  private lifecycle: ReaderSessionSnapshot['state'] = 'stopping';
  private desiredGeneration = 0;
  private switchQueue: Promise<unknown> = Promise.resolve();
  private pendingPosition?: ReadingPosition;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private immersiveActivated = false;
  private disposed = false;
  private readonly createRequestId: () => string;
  private readonly debounceMs: number;
  private readonly now: () => number;

  constructor(
    private readonly books: BookLibraryStore,
    private readonly progress: ReadingProgressStore,
    private readonly adapters: AdapterRegistry,
    private readonly emit: (message: ExtensionToReaderV2Message) => void | Promise<void>,
    private readonly immersivePresenter: ImmersiveReaderPresenter,
    private readonly options: ReaderSessionCoordinatorOptions = {}
  ) {
    this.createRequestId = options.createRequestId ?? randomUUID;
    this.debounceMs = options.debounceMs ?? 400;
    this.now = options.now ?? Date.now;
  }

  snapshot(): ReaderSessionSnapshot | undefined {
    return this.book && this.mode ? {
      bookId: this.book.id,
      mode: this.mode,
      state: this.lifecycle,
      ...(this.currentSection ? { sectionId: this.currentSection.sectionId } : {})
    } : undefined;
  }

  get presentationMode(): ReaderPresentationMode | undefined { return this.mode; }

  openBook(bookId: string, correlatedRequestId?: string): Promise<boolean> {
    return this.queueOpen(bookId, 'webview', correlatedRequestId ?? this.createRequestId());
  }

  openImmersiveBook(bookId: string): Promise<boolean> {
    return this.queueOpen(bookId, 'immersive', this.createRequestId());
  }

  private queueOpen(bookId: string, mode: ReaderPresentationMode, requestId: string): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const book = this.books.get(bookId);
    if (!book || !book.capabilities.readable) {
      void this.emit({ version: READER_PROTOCOL_VERSION, type: 'readerError', requestId, bookId, code: 'notFound', message: `Book ${bookId} is not available.` });
      return Promise.resolve(false);
    }
    const generation = ++this.desiredGeneration;
    if (this.options.preflight) return this.preflightAndQueue(book, mode, requestId, generation);
    return this.enqueuePreparedOpen(book, mode, requestId, generation);
  }

  private async preflightAndQueue(book: BookRecord, mode: ReaderPresentationMode, requestId: string, generation: number): Promise<boolean> {
    let available = false;
    try { available = await this.options.preflight!(book); } catch { available = false; }
    if (generation !== this.desiredGeneration || this.disposed) return false;
    if (!available) {
      await this.emit({ version: READER_PROTOCOL_VERSION, type: 'readerError', requestId, bookId: book.id, code: 'unreadable', message: 'The book file is missing or unreadable.' });
      return false;
    }
    return this.enqueuePreparedOpen(book, mode, requestId, generation);
  }

  private enqueuePreparedOpen(book: BookRecord, mode: ReaderPresentationMode, requestId: string, generation: number): Promise<boolean> {
    const operation = this.switchQueue.then(() => this.performOpen(book, mode, requestId, generation));
    this.switchQueue = operation.catch(() => undefined);
    return operation;
  }

  private async performOpen(book: BookRecord, mode: ReaderPresentationMode, requestId: string, generation: number): Promise<boolean> {
    if (generation !== this.desiredGeneration || this.disposed) return false;
    this.lifecycle = this.handle ? 'switching' : 'opening';
    await this.releaseActiveSession();
    if (generation !== this.desiredGeneration || this.disposed) return false;
    let localHandle: BookHandle | undefined;
    try {
      localHandle = await this.adapters.get(book.format).open(book);
      if (generation !== this.desiredGeneration || this.disposed) { localHandle.dispose(); return false; }
      const [toc, sections] = await Promise.all([localHandle.getToc(), localHandle.getSections()]);
      if (generation !== this.desiredGeneration || this.disposed) { localHandle.dispose(); return false; }
      if (sections.length === 0) throw new Error('The book contains no readable sections.');

      let position = this.progress.get(book.id);
      if (position?.locator.kind === book.format) {
        position = { ...position, locator: await localHandle.normalizeLocator(position.locator) };
      }
      const transition = createReaderState({
        bookId: book.id,
        format: book.format,
        sections: sections.map(section => ({ id: section.id, title: section.title ?? 'Untitled', progressionWeight: section.progressionWeight })),
        position
      });
      this.handle = localHandle;
      localHandle = undefined;
      this.book = book;
      this.engine = transition.state;
      this.sections = sections;
      this.mode = mode;
      this.requestId = requestId;
      this.lifecycle = 'active';

      if (mode === 'webview') {
        await this.emit({
          version: READER_PROTOCOL_VERSION, type: 'bookReady', requestId, bookId: book.id,
          toc, sections, initialSectionId: transition.state.locator.sectionId,
          initialLocator: transition.state.locator
        });
      } else {
        await this.openInitialImmersiveSection(transition.state.locator);
        await this.options.setImmersiveContext?.(true);
      }
      return true;
    } catch {
      localHandle?.dispose();
      if (generation === this.desiredGeneration) {
        await this.releaseActiveSession();
        await this.emit({ version: READER_PROTOCOL_VERSION, type: 'readerError', requestId, bookId: book.id, code: 'openFailed', message: 'Unable to open this book.' });
      }
      return false;
    }
  }

  async requestSection(sectionId: string): Promise<void> {
    const handle = this.handle;
    const book = this.book;
    const requestId = this.requestId;
    if (!handle || !book || this.mode !== 'webview') return;
    const generation = ++this.sectionGeneration;
    try {
      const section = await handle.getSection(sectionId);
      if (generation !== this.sectionGeneration || requestId !== this.requestId || handle !== this.handle) return;
      this.setCurrentSection(section);
      await this.emit({ version: READER_PROTOCOL_VERSION, type: 'sectionReady', requestId, bookId: book.id, sectionId, sectionGeneration: generation, section });
    } catch {
      if (generation === this.sectionGeneration && requestId === this.requestId) {
        await this.emit({ version: READER_PROTOCOL_VERSION, type: 'readerError', requestId, bookId: book.id, code: 'sectionFailed', message: 'Unable to load this section.' });
      }
    }
  }

  async requestNextSection(sectionId: string): Promise<void> { await this.requestAdjacentWebviewSection(sectionId, 1); }
  async requestPreviousSection(sectionId: string): Promise<void> { await this.requestAdjacentWebviewSection(sectionId, -1); }

  private async requestAdjacentWebviewSection(sectionId: string, delta: -1 | 1): Promise<void> {
    const index = this.sections.findIndex(section => section.id === sectionId);
    const target = index < 0 ? undefined : this.sections[index + delta];
    if (!target) {
      if (this.book) await this.emit({ version: READER_PROTOCOL_VERSION, type: delta < 0 ? 'bookStart' : 'bookEnd', requestId: this.requestId, bookId: this.book.id, sectionId });
      return;
    }
    await this.requestSection(target.id);
  }

  async openImage(request: ReaderImageRequest): Promise<void> {
    const handle = this.handle;
    if (!handle || this.mode !== 'webview' || request.requestId !== this.requestId
      || request.bookId !== this.book?.id || request.sectionId !== this.currentSection?.sectionId
      || request.sectionGeneration !== this.sectionGeneration || !this.activeResources.has(request.resourceId)) return;
    try {
      const payload = await handle.readResource(request.sectionId, request.resourceId);
      if (handle !== this.handle || request.sectionGeneration !== this.sectionGeneration) return;
      const opened = await this.options.openImagePreview?.(payload);
      if (opened !== true) await this.emitImageFailure(request);
    } catch { await this.emitImageFailure(request); }
  }

  reportLayout(locator: ReadingLocator, _bookProgression: number): void {
    if (!this.book || this.mode !== 'webview' || locator.sectionId !== this.currentSection?.sectionId) return;
    const persistent = this.toPersistentWebviewLocator(locator, this.currentSection);
    this.queuePosition(persistent);
  }

  async requestNextPage(): Promise<boolean> { return this.moveImmersive('next'); }
  async requestPreviousPage(): Promise<boolean> { return this.moveImmersive('previous'); }
  async requestNextChapter(): Promise<boolean> { return this.moveImmersiveSection(1, 'start'); }
  async requestPreviousChapter(): Promise<boolean> { return this.moveImmersiveSection(-1, 'end'); }

  private async moveImmersive(direction: 'next' | 'previous'): Promise<boolean> {
    if (this.mode !== 'immersive') return false;
    const result = direction === 'next'
      ? await this.immersivePresenter.nextPage()
      : await this.immersivePresenter.previousPage();
    if (result === 'moved') { this.captureImmersivePosition(); return true; }
    if (result === 'unavailable') {
      await this.options.showInformation?.('请先聚焦代码编辑器，再进行沉浸阅读翻页。');
      return false;
    }
    return this.moveImmersiveSection(direction === 'next' ? 1 : -1, direction === 'next' ? 'start' : 'end');
  }

  private async moveImmersiveSection(delta: -1 | 1, edge: 'start' | 'end'): Promise<boolean> {
    if (this.mode !== 'immersive' || !this.handle) return false;
    const target = this.currentSectionIndex + delta;
    if (target < 0 || target >= this.sections.length) return false;
    return this.loadImmersiveSection(target, edge);
  }

  suspendImmersive(): void { if (this.mode === 'immersive') this.immersivePresenter.suspend(); }
  resumeImmersive(): void { if (this.mode === 'immersive') this.immersivePresenter.resume(); }

  async stopImmersive(): Promise<ImmersiveStopResult> {
    if (this.mode !== 'immersive') return { stopped: false, progressPersisted: false };
    const generation = ++this.desiredGeneration;
    const operation = this.switchQueue.then(async (): Promise<ImmersiveStopResult> => {
      if (generation !== this.desiredGeneration || this.mode !== 'immersive') {
        return { stopped: false, progressPersisted: false };
      }
      this.lifecycle = 'stopping';
      return { stopped: true, progressPersisted: await this.releaseActiveSession() };
    });
    this.switchQueue = operation.catch(() => undefined);
    return operation;
  }

  async closeSession(): Promise<void> {
    const generation = ++this.desiredGeneration;
    const operation = this.switchQueue.then(async () => {
      if (generation !== this.desiredGeneration) return;
      this.lifecycle = 'stopping';
      await this.releaseActiveSession();
    });
    this.switchQueue = operation.catch(() => undefined);
    await operation;
  }

  capturePosition(): ReadingPosition | undefined {
    if (this.mode === 'immersive') this.captureImmersivePosition();
    if (this.pendingPosition) return clonePosition(this.pendingPosition);
    if (!this.book || !this.engine) return undefined;
    const stored = this.progress.get(this.book.id);
    if (stored) return clonePosition(stored);
    return {
      bookId: this.book.id,
      locator: { ...this.engine.locator },
      bookProgression: mapLocatorToBookProgression(this.engine.sections, this.engine.locator),
      updatedAt: this.now()
    };
  }

  async flush(): Promise<void> {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
    const position = this.pendingPosition;
    this.pendingPosition = undefined;
    if (position) await this.progress.save(position);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.desiredGeneration += 1;
    await this.switchQueue.catch(() => undefined);
    await this.releaseActiveSession();
  }

  private async openInitialImmersiveSection(locator: ReadingLocator): Promise<void> {
    const index = Math.max(0, this.sections.findIndex(section => section.id === locator.sectionId));
    const loaded = await this.findReadableSection(index, 1);
    if (!loaded) throw new Error('The book contains no readable text.');
    const localOffset = loaded.index === index ? this.restoreImmersiveOffset(locator, loaded.section) : 0;
    this.setCurrentSection(loaded.section);
    this.immersiveActivated = true;
    await this.immersivePresenter.activate({
      bookId: this.book!.id,
      format: this.book!.format,
      sections: this.sections,
      section: loaded.section,
      localOffset
    });
    this.captureImmersivePosition();
  }

  private async loadImmersiveSection(index: number, edge: 'start' | 'end'): Promise<boolean> {
    const loaded = await this.findReadableSection(index, edge === 'start' ? 1 : -1);
    if (!loaded) return false;
    const localOffset = edge === 'start' ? 0 : loaded.section.immersiveProjection.text.length;
    this.setCurrentSection(loaded.section);
    await this.immersivePresenter.showSection(loaded.section, localOffset);
    this.captureImmersivePosition();
    return true;
  }

  private async findReadableSection(index: number, delta: -1 | 1): Promise<{ index: number; section: SafeSectionDocument } | undefined> {
    const handle = this.handle;
    if (!handle) return undefined;
    for (let cursor = index; cursor >= 0 && cursor < this.sections.length; cursor += delta) {
      const section = await handle.getSection(this.sections[cursor].id);
      if (section.immersiveProjection.text.trim().length > 0) return { index: cursor, section };
    }
    return undefined;
  }

  private restoreImmersiveOffset(locator: ReadingLocator, section: SafeSectionDocument): number {
    if (locator.kind === 'txt' && section.locatorSpace.kind === 'txt') {
      const absolute = locator.offsetSpace === 'book' && locator.offset !== undefined
        ? locator.offset
        : section.locatorSpace.sectionStart + Math.floor(locator.progression * (section.locatorSpace.sectionEnd - section.locatorSpace.sectionStart));
      return clampBackwardToGraphemeBoundary(section.immersiveProjection.text, absolute - section.locatorSpace.sectionStart);
    }
    if (locator.kind === 'epub' && section.locatorSpace.kind === 'epub') {
      if (locator.sourceRevision === section.sourceRevision
        && locator.projectionRevision === section.immersiveProjection.projectionRevision
        && locator.immersiveOffset !== undefined) {
        return clampBackwardToGraphemeBoundary(section.immersiveProjection.text, locator.immersiveOffset);
      }
      if (locator.sourceRevision === section.sourceRevision && locator.textOffset !== undefined) {
        return mapSourceOffsetToImmersive(section.immersiveProjection, locator.textOffset);
      }
    }
    return 0;
  }

  private captureImmersivePosition(): void {
    const captured = this.immersivePresenter.capturePosition();
    const section = this.currentSection;
    if (!captured || !section || captured.sectionId !== section.sectionId || !this.book) return;
    const localOffset = clampBackwardToGraphemeBoundary(section.immersiveProjection.text, captured.localOffset);
    let locator: ReadingLocator;
    if (section.locatorSpace.kind === 'txt') {
      const length = Math.max(1, section.locatorSpace.sectionEnd - section.locatorSpace.sectionStart);
      locator = {
        kind: 'txt', sectionId: section.sectionId,
        progression: Math.min(1, localOffset / length),
        offset: section.locatorSpace.sectionStart + localOffset,
        offsetSpace: 'book'
      };
    } else {
      const length = Math.max(1, section.immersiveProjection.text.length);
      locator = {
        kind: 'epub', sectionId: section.sectionId,
        progression: Math.min(1, localOffset / length),
        immersiveOffset: localOffset,
        textOffset: mapImmersiveOffsetToSource(section.immersiveProjection, localOffset),
        sourceRevision: section.sourceRevision,
        projectionRevision: section.immersiveProjection.projectionRevision
      };
    }
    this.queuePosition(locator);
  }

  private toPersistentWebviewLocator(locator: ReadingLocator, section: SafeSectionDocument): ReadingLocator {
    if (locator.kind === 'txt' && section.locatorSpace.kind === 'txt') {
      const localLength = section.locatorSpace.sectionEnd - section.locatorSpace.sectionStart;
      const localOffset = Math.min(localLength, Math.max(0, locator.offset ?? Math.floor(locator.progression * localLength)));
      return {
        kind: 'txt', sectionId: locator.sectionId,
        progression: localLength === 0 ? 0 : localOffset / localLength,
        offset: section.locatorSpace.sectionStart + localOffset,
        offsetSpace: 'book'
      } satisfies TxtLocator;
    }
    if (locator.kind === 'epub' && section.locatorSpace.kind === 'epub') {
      const textOffset = Math.max(0, locator.textOffset ?? 0);
      return {
        kind: 'epub', sectionId: locator.sectionId, progression: locator.progression,
        ...(locator.cfi ? { cfi: locator.cfi } : {}),
        ...(locator.fragment ? { fragment: locator.fragment } : {}),
        textOffset,
        immersiveOffset: mapSourceOffsetToImmersive(section.immersiveProjection, textOffset),
        sourceRevision: section.sourceRevision,
        projectionRevision: section.immersiveProjection.projectionRevision
      } satisfies EpubLocator;
    }
    return { ...locator };
  }

  private queuePosition(locator: ReadingLocator): void {
    if (!this.book || !this.engine) return;
    this.pendingPosition = {
      bookId: this.book.id,
      locator,
      bookProgression: mapLocatorToBookProgression(this.engine.sections, locator),
      updatedAt: this.now()
    };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { void this.flush().catch(() => undefined); }, this.debounceMs);
  }

  private setCurrentSection(section: SafeSectionDocument): void {
    this.currentSection = section;
    this.currentSectionIndex = this.sections.findIndex(value => value.id === section.sectionId);
    this.activeResources = new Set(section.localResources.map(resource => resource.id));
  }

  private async releaseActiveSession(): Promise<boolean> {
    let progressPersisted = true;
    if (this.mode === 'immersive') this.captureImmersivePosition();
    try { await this.flush(); } catch { progressPersisted = false; }
    if (this.immersiveActivated) {
      this.immersiveActivated = false;
      try { await this.immersivePresenter.dispose(); } catch { /* cleanup must continue */ }
    }
    this.handle?.dispose();
    this.handle = undefined;
    this.engine = undefined;
    this.book = undefined;
    this.sections = [];
    this.currentSection = undefined;
    this.currentSectionIndex = -1;
    this.activeResources.clear();
    this.mode = undefined;
    this.requestId = '';
    this.sectionGeneration += 1;
    await this.options.setImmersiveContext?.(false);
    return progressPersisted;
  }

  private async emitImageFailure(request: ReaderImageRequest): Promise<void> {
    await this.emit({
      version: READER_PROTOCOL_VERSION, type: 'imageOpenFailed', requestId: request.requestId,
      bookId: request.bookId, sectionId: request.sectionId,
      sectionGeneration: request.sectionGeneration, message: '图片无法打开'
    });
  }
}

function clonePosition(position: ReadingPosition): ReadingPosition {
  return { ...position, locator: { ...position.locator } };
}
