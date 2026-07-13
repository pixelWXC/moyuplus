import './styles.css';
import { LayoutEngine, type LayoutState } from './layoutEngine';
import type { BookRecord } from '../domain/books';
import { isExtensionToReaderV2Message, type ExtensionToReaderV2Message } from '../reader/readerMessages';
import type { ReaderPreferences } from '../domain/readerPreferences';
import { isExtensionToGitLogMessage } from '../git/gitLogMessages';
import type { GitLogPreferences } from '../git/gitLogModels';
import { GitLogView } from './gitLogView';
import { applyReaderPreferences } from './readerPreferenceStyles';
import {
  createInitialReaderAppState, getLibraryBookActions, readerAppReducer,
  type LibraryBookAction, type LibraryBookItem, type ReaderAppAction
} from './readerState';

export const READER_APP_BUILD_TARGET = 'webview';
interface VsCodeApi { postMessage(message: unknown): void }
interface LibraryStateMessage { type: 'libraryState'; books: BookRecord[]; availability: Record<string, boolean>; progress: Record<string, number>; preferences?: ReaderPreferences }
declare global { interface Window { MoyuplusReader: { LayoutEngine: typeof LayoutEngine }; acquireVsCodeApi?: () => VsCodeApi } }
window.MoyuplusReader = { LayoutEngine };

const vscode = window.acquireVsCodeApi?.();
const app = document.querySelector<HTMLElement>('#app');
let state = createInitialReaderAppState();
let layout: LayoutEngine | undefined;
let requestSequence = 0;
let currentSectionHtml = '';
let appMode: 'boot' | 'readerApp' | 'gitLog' = 'boot';
let gitLogView: GitLogView | undefined;

function dispatch(action: ReaderAppAction): void { state = readerAppReducer(state, action); render(); }
function post(message: unknown): void { vscode?.postMessage(message); }
function envelope(type: string, sectionId?: string): Record<string, unknown> {
  return { version: 2, type, requestId: state.requestId, bookId: state.activeBook?.id, ...(sectionId ? { sectionId } : {}) };
}

function render(): void {
  if (!app) return;
  if (appMode === 'boot') { app.className = 'boot-view'; app.replaceChildren(); return; }
  if (appMode === 'gitLog') return;
  if (state.view === 'reader') { renderReader(app); return; }
  layout?.dispose(); layout = undefined;
  renderLibrary(app);
  post({ type: 'navigationState', canNextPage: false });
}

function renderLibrary(root: HTMLElement): void {
  root.className = 'library-view'; root.replaceChildren();
  const header = element('header', 'library-header');
  const heading = element('div', 'library-heading');
  heading.append(element('p', 'eyebrow', 'MOYUPLUS'), element('h1', undefined, '书架'));
  header.append(heading, button('导入', 'primary-action', () => post({ type: 'importBook' })));
  root.append(header);
  if (state.status === 'loading') { root.append(element('p', 'notice', '正在载入书架…')); return; }
  if (state.status === 'error') { root.append(element('p', 'notice notice-error', state.error ?? '书架载入失败。')); return; }
  if (state.books.length === 0) {
    const empty = element('section', 'empty-library');
    empty.append(element('span', 'empty-mark', '文'), element('h2', undefined, '把下一本书放在手边'),
      element('p', undefined, '导入本地 EPUB 或 TXT。文件留在原处，MoyuPlus 只保存索引。'),
      button('导入 EPUB / TXT', 'primary-action', () => post({ type: 'importBook' })));
    root.append(empty); return;
  }
  const list = element('ol', 'book-list'); list.setAttribute('aria-label', '已导入书籍');
  state.books.forEach(book => list.append(renderBook(book))); root.append(list);
  if (state.pendingRemoval) root.append(renderRemovalConfirmation(state.pendingRemoval.bookId, state.pendingRemoval.message));
}

function renderReader(root: HTMLElement): void {
  root.className = 'reader-view'; root.replaceChildren();
  const toolbar = element('header', 'reader-toolbar');
  toolbar.append(iconButton('←', '返回书架', closeBook), element('strong', 'reader-title', state.activeBook?.title ?? '阅读'));
  const tools = element('div', 'reader-tools');
  tools.append(iconButton('☰', '目录', () => dispatch({ type: 'openDrawer', drawer: 'toc' })), iconButton('Aa', '阅读设置', () => dispatch({ type: 'openDrawer', drawer: 'settings' })));
  toolbar.append(tools); root.append(toolbar);

  const chapter = element('nav', 'chapter-bar'); chapter.setAttribute('aria-label', '章节导航');
  chapter.append(iconButton('‹', '上一章', () => requestAdjacent('requestPreviousSection'), !state.navigation?.canPreviousSection),
    element('span', 'chapter-title', currentSectionTitle()),
    iconButton('›', '下一章', () => requestAdjacent('requestNextSection'), !state.navigation?.canNextSection));
  root.append(chapter);

  const viewport = element('main', 'reader-content'); viewport.id = 'reader-content'; viewport.setAttribute('tabindex', '0'); root.append(viewport);
  applyReaderPreferences(viewport, state.preferencesDraft);
  const priorLayout = state.layout;
  let priorProgression = 0;
  if (priorLayout && priorLayout.sectionId === state.activeSectionId) priorProgression = priorLayout.progression;
  layout?.dispose(); layout = new LayoutEngine(viewport, current => commitLayout(current));
  if (currentSectionHtml && state.activeSectionId) {
    layout.setContent(state.activeSectionId, currentSectionHtml, priorLayout ? priorProgression : (state.initialProgression ?? 0));
    state = readerAppReducer(state, { type: 'layoutChanged', ...layout.getState() });
  } else if (state.status === 'loading') viewport.append(element('p', 'notice', '正在载入章节…'));
  if (state.status === 'error') viewport.append(element('p', 'notice notice-error', state.error ?? '章节载入失败。'));

  const footer = element('footer', 'reader-footer');
  const previous = button('上一页', 'page-action', previousPage, !state.navigation?.canPreviousPage); previous.id = 'previous-page';
  const progress = element('span', 'page-progress', formatReadingProgress()); progress.id = 'page-progress';
  const next = button('下一页', 'page-action', nextPage, !state.navigation?.canNextPage); next.id = 'next-page';
  footer.append(previous, progress, next); root.append(footer);
  if (state.notice) { const notice = element('div', 'reader-toast', state.notice); notice.setAttribute('role', 'status'); root.append(notice); }
  if (state.drawer === 'toc') root.append(renderTocDrawer());
  if (state.drawer === 'settings') root.append(renderSettingsDrawer());
  post({ type: 'navigationState', canNextPage: Boolean(state.navigation?.canNextPage) });
}

function renderTocDrawer(): HTMLElement {
  const drawer = drawerShell('目录');
  const list = element('ol', 'toc-list'); list.setAttribute('aria-label', '书籍目录');
  appendTocNodes(list, state.toc ?? [], 0); drawer.append(list); return drawer;
}
function appendTocNodes(parent: HTMLElement, nodes: NonNullable<typeof state.toc>, depth: number): void {
  nodes.forEach(node => { const item = element('li', 'toc-item');
    const target = button(node.title, node.sectionId === state.activeSectionId ? 'toc-link is-current' : 'toc-link', () => selectSection(node.sectionId));
    target.style.setProperty('--toc-depth', String(depth)); item.append(target);
    if (node.children?.length) { const nested = element('ol', 'toc-list'); appendTocNodes(nested, node.children, depth + 1); item.append(nested); }
    parent.append(item); });
}
function renderSettingsDrawer(): HTMLElement {
  const drawer = drawerShell('阅读设置'); const form = element('form', 'settings-form');
  form.append(selectField('字体', 'fontFamily', [['system', 'VS Code'], ['serif', '衬线'], ['sans-serif', '无衬线']]),
    rangeField('字号', 'fontSize', 12, 32, 1), rangeField('行高', 'lineHeight', 1.2, 2.4, .1),
    rangeField('字距', 'letterSpacing', -.05, .2, .01), rangeField('段距', 'paragraphSpacing', 0, 3, .25),
    rangeField('页边距', 'pagePadding', 8, 64, 2),
    selectField('对齐', 'textAlign', [['left', '左对齐'], ['justify', '两端对齐']]),
    selectField('主题', 'theme', [['system', '跟随 VS Code'], ['light', '明亮'], ['sepia', '纸张'], ['dark', '深色']]));
  const actions = element('div', 'settings-actions');
  actions.append(button('恢复默认', 'subtle-button', () => { dispatch({ type: 'resetPreferences' }); layout?.requestReflow(); }),
    button('保存', 'primary-action', () => { dispatch({ type: 'preferencesSaved' }); post({ type: 'savePreferences', preferences: state.preferencesDraft }); }));
  form.append(actions); drawer.append(form); return drawer;
}

function drawerShell(title: string): HTMLElement {
  const drawer = element('aside', 'reader-drawer'); drawer.setAttribute('aria-label', title);
  const header = element('header', 'drawer-header'); header.append(element('h2', undefined, title), iconButton('×', `关闭${title}`, () => { dispatch({ type: 'closeDrawer' }); layout?.requestReflow(); })); drawer.append(header); return drawer;
}
function selectField(label: string, key: keyof ReaderPreferences, options: string[][]): HTMLElement {
  const field = element('label', 'setting-field'); field.append(element('span', undefined, label)); const select = element('select') as HTMLSelectElement;
  options.forEach(([value, text]) => { const option = element('option', undefined, text) as HTMLOptionElement; option.value = value; option.selected = state.preferencesDraft[key] === value; select.append(option); });
  select.addEventListener('change', () => preview(key, select.value)); field.append(select); return field;
}
function rangeField(label: string, key: keyof ReaderPreferences, min: number, max: number, step: number): HTMLElement {
  const field = element('label', 'setting-field range-field'); const value = Number(state.preferencesDraft[key]);
  field.append(element('span', undefined, `${label} ${value}`)); const input = element('input') as HTMLInputElement;
  Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => preview(key, Number(input.value))); field.append(input); return field;
}
function preview(key: keyof ReaderPreferences, value: unknown): void { dispatch({ type: 'previewPreferences', patch: { [key]: value } }); layout?.requestReflow(); }

function openBook(book: LibraryBookItem): void { const requestId = `webview-${Date.now()}-${++requestSequence}`; dispatch({ type: 'openReader', book, requestId }); post({ version: 2, type: 'openBook', requestId, bookId: book.id }); }
function selectSection(sectionId: string): void { dispatch({ type: 'selectSection', sectionId }); post(envelope('requestSection', sectionId)); }
function requestAdjacent(type: 'requestNextSection' | 'requestPreviousSection'): void { const id = state.activeSectionId; if (id) post(envelope(type, id)); }
function nextPage(): void { if (layout?.nextPage()) updateLayout(); else if (state.navigation?.canNextSection) requestAdjacent('requestNextSection'); else dispatch({ type: 'bookBoundary', edge: 'end' }); }
function previousPage(): void { if (layout?.previousPage()) updateLayout(); else if (state.navigation?.canPreviousSection) requestAdjacent('requestPreviousSection'); else dispatch({ type: 'bookBoundary', edge: 'start' }); }
function updateLayout(): void { if (layout) commitLayout(layout.getState()); }
function commitLayout(current: LayoutState): void {
  state = readerAppReducer(state, { type: 'layoutChanged', ...current });
  const previous = document.querySelector<HTMLButtonElement>('#previous-page'); if (previous) previous.disabled = !state.navigation?.canPreviousPage;
  const next = document.querySelector<HTMLButtonElement>('#next-page'); if (next) next.disabled = !state.navigation?.canNextPage;
  const progress = document.querySelector<HTMLElement>('#page-progress'); if (progress) progress.textContent = formatReadingProgress();
  post({ type: 'navigationState', canNextPage: Boolean(state.navigation?.canNextPage) });
  post({ ...envelope('layoutStable', current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
}
function closeBook(): void {
  if (layout) {
    const current = layout.getState();
    post({ ...envelope('closeBook', current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
  }
  dispatch({ type: 'closeReader' });
}
function locatorFor(current: LayoutState): Record<string, unknown> { return state.activeBook?.format === 'txt' ? { kind: 'txt', sectionId: current.sectionId, progression: current.progression, offset: current.startOffset } : { kind: 'epub', sectionId: current.sectionId, progression: current.progression }; }
function wholeBookProgress(current: LayoutState): number { const sections = state.sections ?? []; const total = sections.reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0); const index = sections.findIndex(section => section.id === current.sectionId); if (total <= 0 || index < 0) return 0; const before = sections.slice(0, index).reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0); return (before + current.progression * Math.max(1, sections[index].progressionWeight)) / total; }

function currentSectionTitle(): string { return state.sections?.find(section => section.id === state.activeSectionId)?.title ?? '正文'; }
function formatReadingProgress(): string { const page = state.layout; return page ? `${page.pageIndex + 1} / ${page.pageCount}` : '—'; }

function renderBook(book: LibraryBookItem): HTMLElement { const row = element('li', `book-row${book.available ? '' : ' is-missing'}`); const open = button('', 'book-open', () => openBook(book), !book.available); open.setAttribute('aria-label', `打开《${book.title}》`); const format = element('span', `format-badge format-${book.format}`, book.format.toUpperCase()); const copy = element('span', 'book-copy'); copy.append(element('strong', 'book-title', book.title), element('span', 'book-meta', `${book.authors.length ? book.authors.join('、') : '未知作者'} · ${formatProgress(book.progress)}`)); if (!book.available) copy.append(element('span', 'missing-status', '原文件已移动或删除')); open.append(format, copy); row.append(open, renderActions(book)); return row; }
function renderActions(book: LibraryBookItem): HTMLElement { const actions = element('div', 'book-actions'); const labels: Record<LibraryBookAction, string> = { open: '阅读', startTypingPractice: '打字练习', relocate: '重新定位', remove: '移除' }; getLibraryBookActions(book).filter(action => action !== 'open').forEach(action => actions.append(button(labels[action], action === 'remove' ? 'danger-action' : 'subtle-action', () => action === 'remove' ? dispatch({ type: 'requestRemove', bookId: book.id }) : post({ type: action, bookId: book.id })))); return actions; }
function renderRemovalConfirmation(bookId: string, message: string): HTMLElement { const book = state.books.find(item => item.id === bookId); const section = element('section', 'removal-confirmation'); section.setAttribute('role', 'alertdialog'); section.append(element('strong', undefined, `移除《${book?.title ?? '这本书'}》？`), element('p', undefined, message)); const actions = element('div', 'confirmation-actions'); actions.append(button('取消', 'subtle-action', () => dispatch({ type: 'cancelRemove' })), button('从书架移除', 'danger-button', () => post({ type: 'removeBook', bookId }))); section.append(actions); return section; }
function formatProgress(progress: number): string { return progress <= 0 ? '未开始' : `已读 ${Math.round(progress * 100)}%`; }
function iconButton(label: string, ariaLabel: string, handler: () => void, disabled = false): HTMLButtonElement { const target = button(label, 'icon-button', handler, disabled); target.setAttribute('aria-label', ariaLabel); target.title = ariaLabel; return target; }
function button(label: string, className: string, handler: () => void, disabled = false): HTMLButtonElement { const target = element('button', className, label) as HTMLButtonElement; target.type = 'button'; target.disabled = disabled; target.addEventListener('click', handler); return target; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] { const target = document.createElement(tag); if (className) target.className = className; if (text !== undefined) target.textContent = text; return target; }

window.addEventListener('message', event => {
  if (isModeGitLog(event.data) && app) {
    layout?.dispose(); layout = undefined;
    gitLogView?.dispose();
    appMode = 'gitLog';
    gitLogView = new GitLogView(app, post);
    gitLogView.begin(event.data.sessionId, event.data.preferences, event.data.readerPreferences);
    post({ type: 'navigationState', canNextPage: false });
    return;
  }
  if (isModeLibrary(event.data)) {
    gitLogView?.dispose(); gitLogView = undefined;
    appMode = 'readerApp';
    if (event.data.message) dispatch({ type: 'showError', message: event.data.message });
    else render();
    return;
  }
  if (isModeReaderRestore(event.data)) {
    gitLogView?.dispose(); gitLogView = undefined;
    appMode = 'readerApp';
    if (event.data.preferences) state = readerAppReducer(state, { type: 'preferencesLoaded', preferences: event.data.preferences });
    dispatch({ type: 'openReader', book: event.data.book, requestId: event.data.requestId });
    return;
  }
  if (isExtensionToGitLogMessage(event.data)) {
    if (appMode === 'gitLog') gitLogView?.receive(event.data);
    return;
  }
  if (isReaderCommand(event.data)) {
    if (appMode !== 'readerApp') return;
    const command = event.data.command;
    if (command === 'nextPage') nextPage();
    else if (command === 'previousPage') previousPage();
    else if (command === 'nextChapter') requestAdjacent('requestNextSection');
    else if (command === 'previousChapter') requestAdjacent('requestPreviousSection');
    else if (command === 'openLibrary') closeBook();
    else if (command === 'openToc') dispatch({ type: 'openDrawer', drawer: 'toc' });
    else if (command === 'openSettings') dispatch({ type: 'openDrawer', drawer: 'settings' });
    return;
  }
  const incoming = event.data as Partial<LibraryStateMessage>;
  if (incoming.type === 'libraryState' && Array.isArray(incoming.books)) { appMode = 'readerApp'; dispatch({ type: 'libraryLoaded', books: incoming.books, availability: incoming.availability ?? {}, progress: incoming.progress ?? {} }); if (incoming.preferences) dispatch({ type: 'preferencesLoaded', preferences: incoming.preferences }); return; }
  if (isLibraryLoadError(event.data)) { dispatch({ type: 'showError', message: event.data.message }); return; }
  if (appMode !== 'readerApp' || !isExtensionToReaderV2Message(event.data)) return;
  const message: ExtensionToReaderV2Message = event.data;
  if (!state.requestId || message.requestId !== state.requestId || message.bookId !== state.activeBook?.id) return;
  if (message.type === 'bookReady') { dispatch({ type: 'bookReady', requestId: message.requestId, toc: message.toc, sections: message.sections, initialSectionId: message.initialSectionId, initialProgression: message.initialLocator.progression }); post(envelope('requestSection', message.initialSectionId)); return; }
  if (message.type === 'sectionReady') { currentSectionHtml = message.section.sanitizedHtml; dispatch({ type: 'selectSection', sectionId: message.sectionId }); updateLayout(); return; }
  if (message.type === 'bookStart' || message.type === 'bookEnd') { dispatch({ type: 'bookBoundary', edge: message.type === 'bookStart' ? 'start' : 'end' }); return; }
  if (message.type === 'readerError') dispatch({ type: 'showError', message: message.message });
});

function isReaderCommand(value: unknown): value is { type: 'command'; command: 'nextPage' | 'previousPage' | 'nextChapter' | 'previousChapter' | 'openLibrary' | 'openToc' | 'openSettings' } {
  if (typeof value !== 'object' || value === null || (value as { type?: unknown }).type !== 'command') return false;
  return ['nextPage', 'previousPage', 'nextChapter', 'previousChapter', 'openLibrary', 'openToc', 'openSettings']
    .includes(String((value as { command?: unknown }).command));
}

function isLibraryLoadError(value: unknown): value is { type: 'libraryLoadError'; message: string } {
  return typeof value === 'object' && value !== null
    && (value as { type?: unknown }).type === 'libraryLoadError'
    && typeof (value as { message?: unknown }).message === 'string';
}

function isModeGitLog(value: unknown): value is { type: 'modeGitLog'; sessionId: string; preferences: GitLogPreferences; readerPreferences: ReaderPreferences } {
  return isRecord(value) && value.type === 'modeGitLog' && typeof value.sessionId === 'string'
    && isRecord(value.preferences) && isRecord(value.readerPreferences);
}

function isModeLibrary(value: unknown): value is { type: 'modeLibrary'; message?: string } {
  return isRecord(value) && value.type === 'modeLibrary' && (value.message === undefined || typeof value.message === 'string');
}

function isModeReaderRestore(value: unknown): value is { type: 'modeReaderRestore'; book: LibraryBookItem; requestId: string; preferences?: ReaderPreferences } {
  return isRecord(value) && value.type === 'modeReaderRestore' && isRecord(value.book)
    && typeof value.book.id === 'string' && typeof value.requestId === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

render(); post({ type: 'appReady' });
