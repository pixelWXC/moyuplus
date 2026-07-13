import { randomUUID } from 'node:crypto';
import type { BookHandle } from '../adapters/bookAdapter';
import type { AdapterRegistry } from '../adapters/adapterRegistry';
import { openBook as createReaderState, type ReaderEngineState } from '../domain/readerEngine';
import type { ReadingLocator, ReadingPosition } from '../domain/locators';
import type { BookLibraryStore } from '../storage/bookLibraryStore';
import type { ReadingProgressStore } from '../storage/readingProgressStore';
import { READER_PROTOCOL_VERSION, type ExtensionToReaderV2Message } from './readerMessages';

export interface ReaderControllerOptions {
  createRequestId?: () => string;
  debounceMs?: number;
  now?: () => number;
}

export const DEFAULT_PROGRESS_DEBOUNCE_MS = 400;

export class ReaderController {
  private handle?: BookHandle;
  private state?: ReaderEngineState;
  private requestId = '';
  private sectionGeneration = 0;
  private abortController?: AbortController;
  private pendingPosition?: ReadingPosition;
  private sections: Array<{ id: string }> = [];
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readonly createRequestId: () => string;
  private readonly debounceMs: number;
  private readonly now: () => number;

  constructor(
    private readonly books: BookLibraryStore,
    private readonly progress: ReadingProgressStore,
    private readonly adapters: AdapterRegistry,
    private readonly emit: (message: ExtensionToReaderV2Message) => void | Promise<void>,
    options: ReaderControllerOptions = {}
  ) {
    this.createRequestId = options.createRequestId ?? randomUUID;
    this.debounceMs = options.debounceMs ?? DEFAULT_PROGRESS_DEBOUNCE_MS;
    this.now = options.now ?? Date.now;
  }

  async openBook(bookId: string, correlatedRequestId?: string): Promise<void> {
    await this.flush();
    const requestId = correlatedRequestId ?? this.createRequestId();
    this.requestId = requestId;
    this.sectionGeneration += 1;
    this.abortController?.abort();
    this.abortController = new AbortController();
    const previous = this.handle;
    this.handle = undefined;
    this.state = undefined;
    previous?.dispose();
    const book = this.books.get(bookId);
    if (!book) {
      await this.sendError(requestId, bookId, 'notFound', `Book ${bookId} is not in the library.`);
      return;
    }
    try {
      const handle = await this.adapters.get(book.format).open(book);
      if (requestId !== this.requestId) { handle.dispose(); return; }
      const [toc, sections] = await Promise.all([handle.getToc(), handle.getSections()]);
      if (requestId !== this.requestId) { handle.dispose(); return; }
      if (sections.length === 0) throw new Error('The book contains no readable sections.');
      this.handle = handle;
      this.sections = sections;
      const transition = createReaderState({
        bookId, format: book.format,
        sections: sections.map(section => ({ id: section.id, title: section.title ?? 'Untitled', progressionWeight: section.progressionWeight })),
        position: this.progress.get(bookId)
      });
      this.state = transition.state;
      await this.emit({ version: READER_PROTOCOL_VERSION, type: 'bookReady', requestId, bookId, toc, sections, initialSectionId: transition.state.locator.sectionId, initialLocator: transition.state.locator });
    } catch {
      if (requestId === this.requestId) await this.sendError(requestId, bookId, 'openFailed', 'Unable to open this book.');
    }
  }

  async requestSection(sectionId: string): Promise<void> {
    const handle = this.handle; const state = this.state; const requestId = this.requestId;
    if (!handle || !state) return;
    const generation = ++this.sectionGeneration;
    try {
      const section = await handle.getSection(sectionId);
      if (generation !== this.sectionGeneration || requestId !== this.requestId) return;
      await this.emit({ version: READER_PROTOCOL_VERSION, type: 'sectionReady', requestId, bookId: state.bookId, sectionId, section });
    } catch {
      if (generation === this.sectionGeneration && requestId === this.requestId) await this.sendError(requestId, state.bookId, 'sectionFailed', 'Unable to load this section.');
    }
  }

  async requestNextSection(sectionId: string): Promise<void> { await this.requestAdjacentSection(sectionId, 1); }

  async requestPreviousSection(sectionId: string): Promise<void> { await this.requestAdjacentSection(sectionId, -1); }

  reportLayout(locator: ReadingLocator, bookProgression: number): void {
    const state = this.state;
    if (!state || locator.sectionId.trim().length === 0) return;
    this.pendingPosition = { bookId: state.bookId, locator, bookProgression, updatedAt: this.now() };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { void this.flush(); }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
    const position = this.pendingPosition;
    this.pendingPosition = undefined;
    if (position) await this.progress.save(position);
  }

  async dispose(): Promise<void> {
    await this.flush();
    this.abortController?.abort();
    this.handle?.dispose();
    this.handle = undefined;
    this.state = undefined;
    this.sections = [];
  }

  private async requestAdjacentSection(sectionId: string, delta: -1 | 1): Promise<void> {
    const state = this.state;
    if (!state) return;
    const index = this.sections.findIndex(section => section.id === sectionId);
    const target = index < 0 ? undefined : this.sections[index + delta];
    if (!target) {
      await this.emit({ version: READER_PROTOCOL_VERSION, type: delta < 0 ? 'bookStart' : 'bookEnd', requestId: this.requestId, bookId: state.bookId, sectionId });
      return;
    }
    await this.requestSection(target.id);
  }

  private async sendError(requestId: string, bookId: string, code: string, message: string): Promise<void> {
    await this.emit({ version: READER_PROTOCOL_VERSION, type: 'readerError', requestId, bookId, code, message });
  }
}
