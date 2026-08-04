import * as vscode from 'vscode';
import { findPreviousImmersivePageStart, paginateImmersiveText, type ImmersivePage } from '../domain/immersivePaginator';
import { normalizeImmersiveReaderPreferences, type ImmersiveReaderPreferences } from '../domain/immersiveReaderPreferences';
import type { SafeSectionDocument } from '../adapters/bookAdapter';
import type { ImmersiveReaderPresenter, PresenterPageMove, ReaderPresenterActivation } from './readerPresenter';
import {
  OPEN_IMMERSIVE_IMAGE_COMMAND_ID,
  type ImmersiveImageOpenRequest
} from './immersiveImageCommand';

interface DisposableLike { dispose(): void }
interface DecorationTypeLike extends DisposableLike {}
interface DocumentLike {
  uri?: { scheme: string };
  lineCount: number;
  lineAt(line: number): { text: string };
}
interface EditorLike {
  document: DocumentLike;
  selection: { active: { line: number } };
  setDecorations(type: DecorationTypeLike, options: unknown[]): void;
}

export interface ImmersiveDecorationHost {
  activeTextEditor(): EditorLike | undefined;
  createDecorationType(options: unknown): DecorationTypeLike;
  themeColor(id: string): unknown;
  createRange(line: number, character: number): unknown;
  createImageHover(actions: readonly ImmersiveImageHoverAction[]): unknown;
  onDidChangeActiveTextEditor(callback: (editor: EditorLike | undefined) => void): DisposableLike;
  onDidChangeTextEditorSelection(callback: (event: { textEditor: EditorLike }) => void): DisposableLike;
  onDidChangeTextDocument(callback: (event: { document: object }) => void): DisposableLike;
  onDidChangeWindowState(callback: (event: { focused: boolean }) => void): DisposableLike;
  schedule(callback: () => void, delay: number): unknown;
  cancelScheduled(token: unknown): void;
}

export interface ImmersiveImageHoverAction {
  label: string;
  request: ImmersiveImageOpenRequest;
}

export class ImmersiveDecorationPresenter implements ImmersiveReaderPresenter {
  readonly mode = 'immersive' as const;
  private preferences: ImmersiveReaderPreferences;
  private bookId?: string;
  private section?: SafeSectionDocument;
  private localOffset = 0;
  private currentPage?: ImmersivePage;
  private history: number[] = [];
  private editor?: EditorLike;
  private decorationType?: DecorationTypeLike;
  private listeners: DisposableLike[] = [];
  private renderTimer?: unknown;
  private displayState: 'idle' | 'armed' | 'visible' | 'suspended' = 'idle';

  constructor(
    preferences: ImmersiveReaderPreferences,
    private readonly host: ImmersiveDecorationHost = createVSCodeDecorationHost()
  ) {
    this.preferences = normalizeImmersiveReaderPreferences(preferences);
  }

  async activate(snapshot: ReaderPresenterActivation): Promise<void> {
    await this.dispose();
    this.bookId = snapshot.bookId;
    this.section = snapshot.section;
    this.localOffset = snapshot.localOffset;
    this.history = [];
    this.decorationType = this.createDecorationType();
    this.listeners = [
      this.host.onDidChangeActiveTextEditor(editor => this.activeEditorChanged(editor)),
      this.host.onDidChangeTextEditorSelection(event => this.selectionChanged(event.textEditor)),
      this.host.onDidChangeTextDocument(event => this.documentChanged(event.document)),
      this.host.onDidChangeWindowState(event => this.windowStateChanged(event.focused))
    ];
    this.displayState = 'armed';
  }

  async showSection(section: SafeSectionDocument, localOffset: number): Promise<void> {
    this.section = section;
    this.localOffset = localOffset;
    this.currentPage = undefined;
    this.history = [];
    this.renderCurrent();
  }

  async nextPage(): Promise<PresenterPageMove> {
    if (this.displayState !== 'visible' || !this.section || !this.currentPage) return 'unavailable';
    if (this.currentPage.endOffset >= this.section.immersiveProjection.text.length) return 'end';
    const previous = this.localOffset;
    const applied = this.applyAt(this.currentPage.endOffset);
    if (!applied) return 'unavailable';
    this.history.push(previous);
    this.localOffset = applied.startOffset;
    this.currentPage = applied;
    return 'moved';
  }

  async previousPage(): Promise<PresenterPageMove> {
    if (this.displayState !== 'visible' || !this.section) return 'unavailable';
    if (this.localOffset <= 0) return 'start';
    const text = this.section.immersiveProjection.text;
    const candidate = this.history.pop() ?? findPreviousImmersivePageStart(text, this.localOffset, this.paginationOptions());
    const applied = this.applyAt(candidate);
    if (!applied) return 'unavailable';
    this.localOffset = applied.startOffset;
    this.currentPage = applied;
    return 'moved';
  }

  capturePosition(): { sectionId: string; localOffset: number } | undefined {
    return this.section ? { sectionId: this.section.sectionId, localOffset: this.localOffset } : undefined;
  }

  suspend(): void {
    this.cancelRender();
    this.clearEditor();
    if (this.section) this.displayState = 'suspended';
  }

  resume(): void {
    if (this.section) this.activeEditorChanged(this.host.activeTextEditor());
  }

  applyPreferences(preferences: ImmersiveReaderPreferences): void {
    this.preferences = normalizeImmersiveReaderPreferences(preferences);
    const previous = this.decorationType;
    if (previous) {
      this.clearEditor();
      previous.dispose();
      this.decorationType = this.createDecorationType();
    }
    this.renderCurrent();
  }

  async dispose(): Promise<void> {
    this.cancelRender();
    this.clearEditor();
    for (const listener of this.listeners.splice(0)) listener.dispose();
    this.decorationType?.dispose();
    this.decorationType = undefined;
    this.section = undefined;
    this.bookId = undefined;
    this.currentPage = undefined;
    this.history = [];
    this.localOffset = 0;
    this.displayState = 'idle';
  }

  private activeEditorChanged(editor: EditorLike | undefined): void {
    if (editor !== this.editor) this.clearEditor();
    this.editor = editor;
    if (!editor) {
      this.displayState = this.section ? 'armed' : 'idle';
      return;
    }
    this.renderCurrent();
  }

  private selectionChanged(editor: EditorLike): void {
    if (editor !== this.editor || !this.section) return;
    this.cancelRender();
    this.renderTimer = this.host.schedule(() => {
      this.renderTimer = undefined;
      if (editor === this.editor) this.renderCurrent();
    }, 60);
  }

  private documentChanged(document: object): void {
    if (this.editor?.document !== document) return;
    this.selectionChanged(this.editor);
  }

  private windowStateChanged(focused: boolean): void {
    if (!focused) this.suspend();
    else this.activeEditorChanged(this.host.activeTextEditor());
  }

  private renderCurrent(): void {
    const page = this.applyAt(this.localOffset);
    if (page) this.currentPage = page;
  }

  private applyAt(offset: number): ImmersivePage | undefined {
    const editor = this.editor;
    const section = this.section;
    const decorationType = this.decorationType;
    if (!editor || !section || !decorationType || editor.document.lineCount <= 0) {
      this.displayState = section ? 'armed' : 'idle';
      return undefined;
    }
    const anchor = Math.min(editor.document.lineCount - 1, Math.max(0, editor.selection.active.line));
    const availableLines = Math.max(0, editor.document.lineCount - anchor);
    const page = paginateImmersiveText(section.immersiveProjection.text, offset, {
      visualLines: this.preferences.visualLines,
      graphemesPerLine: this.preferences.graphemesPerLine,
      availableLines
    });
    const decorations = page.lines.map((text, index) => {
      const line = anchor + index;
      const character = editor.document.lineAt(line).text.length;
      const lineRange = page.lineRanges[index];
      const imageActions = lineRange ? this.imageActionsForRange(section, lineRange) : [];
      return {
        range: this.host.createRange(line, character),
        ...(imageActions.length > 0 ? { hoverMessage: this.host.createImageHover(imageActions) } : {}),
        renderOptions: { after: { contentText: text } }
      };
    });
    try {
      editor.setDecorations(decorationType, decorations);
      this.displayState = 'visible';
      return page;
    } catch {
      this.clearEditor();
      this.displayState = 'suspended';
      return undefined;
    }
  }

  private imageActionsForRange(
    section: SafeSectionDocument,
    range: { startOffset: number; endOffset: number }
  ): ImmersiveImageHoverAction[] {
    const bookId = this.bookId;
    if (!bookId) return [];
    return section.immersiveProjection.resourceAnchors
      .filter(anchor => anchor.startOffset < range.endOffset && anchor.endOffset > range.startOffset)
      .map(anchor => ({
        label: anchor.label,
        request: { bookId, sectionId: section.sectionId, resourceId: anchor.resourceId }
      }));
  }

  private clearEditor(): void {
    const editor = this.editor;
    const decorationType = this.decorationType;
    this.editor = undefined;
    if (!editor || !decorationType) return;
    try { editor.setDecorations(decorationType, []); } catch { /* stale editors are safe to ignore */ }
  }

  private paginationOptions() {
    const editor = this.editor;
    const anchor = editor ? Math.min(editor.document.lineCount - 1, Math.max(0, editor.selection.active.line)) : 0;
    return {
      visualLines: this.preferences.visualLines,
      graphemesPerLine: this.preferences.graphemesPerLine,
      availableLines: editor ? Math.max(0, editor.document.lineCount - anchor) : this.preferences.visualLines
    };
  }

  private createDecorationType(): DecorationTypeLike {
    const color = this.preferences.textColor === 'theme'
      ? this.host.themeColor('editorCodeLens.foreground')
      : this.preferences.textColor;
    return this.host.createDecorationType({
      after: {
        color,
        backgroundColor: this.preferences.backgroundColor === 'transparent' ? undefined : this.preferences.backgroundColor,
        fontWeight: this.preferences.fontWeight,
        fontStyle: this.preferences.italic ? 'italic' : 'normal',
        margin: `0 0 0 ${this.preferences.leftMargin}px`
      }
    });
  }

  private cancelRender(): void {
    if (this.renderTimer === undefined) return;
    this.host.cancelScheduled(this.renderTimer);
    this.renderTimer = undefined;
  }
}

export function createVSCodeDecorationHost(): ImmersiveDecorationHost {
  return {
    activeTextEditor: () => vscode.window.activeTextEditor as unknown as EditorLike | undefined,
    createDecorationType: options => vscode.window.createTextEditorDecorationType(options as vscode.DecorationRenderOptions) as unknown as DecorationTypeLike,
    themeColor: id => new vscode.ThemeColor(id),
    createRange: (line, character) => new vscode.Range(line, character, line, character),
    createImageHover: actions => createImageHover(actions),
    onDidChangeActiveTextEditor: callback => vscode.window.onDidChangeActiveTextEditor(editor => callback(editor as unknown as EditorLike | undefined)),
    onDidChangeTextEditorSelection: callback => vscode.window.onDidChangeTextEditorSelection(event => callback({ textEditor: event.textEditor as unknown as EditorLike })),
    onDidChangeTextDocument: callback => vscode.workspace.onDidChangeTextDocument(event => callback({ document: event.document })),
    onDidChangeWindowState: callback => vscode.window.onDidChangeWindowState(event => callback({ focused: event.focused })),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancelScheduled: token => clearTimeout(token as ReturnType<typeof setTimeout>)
  };
}

function createImageHover(actions: readonly ImmersiveImageHoverAction[]): vscode.MarkdownString {
  const hover = new vscode.MarkdownString();
  actions.forEach((action, index) => {
    if (index > 0) hover.appendMarkdown('\n\n');
    hover.appendText(action.label);
    const argumentsJson = encodeURIComponent(JSON.stringify([action.request]));
    hover.appendMarkdown(` · [打开图片](command:${OPEN_IMMERSIVE_IMAGE_COMMAND_ID}?${argumentsJson})`);
  });
  hover.isTrusted = { enabledCommands: [OPEN_IMMERSIVE_IMAGE_COMMAND_ID] };
  return hover;
}
