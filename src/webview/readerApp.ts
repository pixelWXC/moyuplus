import './styles.css';
import { fitsWithinSurface, LayoutEngine, type LayoutState } from './layoutEngine';
import type { BookRecord } from '../domain/books';
import { READER_PROTOCOL_VERSION, isExtensionToReaderV2Message, type ExtensionToReaderV2Message } from '../reader/readerMessages';
import type { ReaderPreferences } from '../domain/readerPreferences';
import { isExtensionToGitLogMessage, type ExtensionToGitLogMessage } from '../git/gitLogMessages';
import type { GitLogPreferences } from '../git/gitLogModels';
import { GitLogView } from './gitLogView';
import { applyReaderPreferences } from './readerPreferenceStyles';
import { InternalTargetResolver, type TextTreeNode } from './internalTargetResolver';
import { ReaderNavigator } from './readerNavigator';
import type { ReaderHistoryLocation } from './readerNavigationHistory';
import {
  createInitialReaderAppState, getLibraryBookActions, readerAppReducer,
  type LibraryBookAction, type LibraryBookItem, type ReaderAppAction
} from './readerState';

export const READER_APP_BUILD_TARGET = 'webview';
interface VsCodeApi { postMessage(message: unknown): void }
interface LibraryStateMessage { type: 'libraryState'; books: BookRecord[]; availability: Record<string, boolean>; progress: Record<string, number>; preferences?: ReaderPreferences }
type ModeReaderRestoreMessage = Omit<LibraryStateMessage, 'type'> & {
  type: 'modeReaderRestore'; modeGeneration: number; book: BookRecord; requestId: string;
};
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
let acceptedModeGeneration = 0;
const navigator = new ReaderNavigator();
let currentSectionGeneration = 0;
let currentSourceRevision = '';
let currentResourceIds = new Set<string>();
let pendingNavigation: PendingNavigation | undefined;
let initialEpubRestore: { textOffset: number; sourceRevision: string } | undefined;

interface PendingNavigation {
  kind: 'move' | 'undo';
  before?: ReaderHistoryLocation;
  target?: ReaderHistoryLocation;
  expectedSectionId?: string;
  fragment?: string;
  edge?: 'start' | 'end';
  resolve?: (restored: boolean) => void;
}

function dispatch(action: ReaderAppAction): void {
  state = readerAppReducer(state, action);
  if (action.type === 'openDrawer' || action.type === 'closeDrawer') {
    syncReaderDrawer();
    return;
  }
  render();
}
function post(message: unknown): void { vscode?.postMessage(message); }
function envelope(type: string, sectionId?: string): Record<string, unknown> {
  return { version: READER_PROTOCOL_VERSION, type, requestId: state.requestId, bookId: state.activeBook?.id, ...(sectionId ? { sectionId } : {}) };
}

function render(): void {
  if (!app) return;
  if (appMode === 'boot') { app.className = 'boot-view'; app.replaceChildren(); return; }
  if (appMode === 'gitLog') return;
  if (state.view === 'reader') { renderReader(app); return; }
  layout?.dispose(); layout = undefined;
  renderLibrary(app);
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
    empty.append(element('h2', undefined, '书架中还没有书'),
      element('p', undefined, '点击右上角“导入”，添加本地 EPUB 或 TXT。'));
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
  const undo = iconButton('↶', '撤回阅读位置', () => { void undoLocation(); }, !navigator.canUndo); undo.id = 'undo-location';
  tools.append(undo, iconButton('☰', '目录', () => dispatch({ type: 'openDrawer', drawer: 'toc' })), iconButton('Aa', '阅读设置', () => dispatch({ type: 'openDrawer', drawer: 'settings' })));
  toolbar.append(tools); root.append(toolbar);

  const chapter = element('nav', 'chapter-bar'); chapter.setAttribute('aria-label', '章节导航');
  const previousChapter = iconButton('‹', '上一章', () => requestAdjacent('requestPreviousSection'), !state.navigation?.canPreviousSection);
  previousChapter.id = 'previous-chapter';
  const chapterTitle = element('span', 'chapter-title', currentSectionTitle()); chapterTitle.id = 'chapter-title';
  const nextChapter = iconButton('›', '下一章', () => requestAdjacent('requestNextSection'), !state.navigation?.canNextSection);
  nextChapter.id = 'next-chapter';
  chapter.append(previousChapter, chapterTitle, nextChapter);
  root.append(chapter);

  const viewport = element('main', 'reader-viewport'); viewport.setAttribute('tabindex', '0');
  const page = element('div', 'reader-content reader-page'); page.id = 'reader-content'; viewport.append(page); root.append(viewport);
  const footer = element('footer', 'reader-footer');
  const previous = button('上一页', 'page-action', previousPage, !state.navigation?.canPreviousPage); previous.id = 'previous-page';
  const progress = element('span', 'page-progress', formatReadingProgress()); progress.id = 'page-progress';
  const next = button('下一页', 'page-action', nextPage, !state.navigation?.canNextPage); next.id = 'next-page';
  footer.append(previous, progress, next); root.append(footer);
  applyReaderPreferences(page, state.preferencesDraft);
  page.addEventListener('click', handleReaderContentClick);
  const priorLayout = state.layout;
  let priorProgression = 0;
  if (priorLayout && priorLayout.sectionId === state.activeSectionId) priorProgression = priorLayout.progression;
  layout?.dispose(); layout = new LayoutEngine(page, current => commitLayout(current));
  if (currentSectionHtml && state.activeSectionId) {
    layout.setContent(state.activeSectionId, currentSectionHtml, priorLayout ? priorProgression : (state.initialProgression ?? 0));
    state = readerAppReducer(state, { type: 'layoutChanged', ...layout.getState() });
  } else if (state.status === 'loading') page.append(element('p', 'notice', '正在载入章节…'));
  if (state.status === 'error') page.append(element('p', 'notice notice-error', state.error ?? '章节载入失败。'));

  syncReaderNotice();
  syncReaderDrawer();
  postNavigationState();
}

function syncReaderDrawer(): void {
  if (!app || appMode !== 'readerApp' || state.view !== 'reader') return;
  app.querySelector(':scope > .reader-drawer')?.remove();
  if (state.drawer === 'toc') app.append(renderTocDrawer());
  if (state.drawer === 'settings') app.append(renderSettingsDrawer());
}

function syncReaderSectionUi(): void {
  const title = document.querySelector<HTMLElement>('#chapter-title');
  if (title) title.textContent = currentSectionTitle();
  const previousChapter = document.querySelector<HTMLButtonElement>('#previous-chapter');
  if (previousChapter) previousChapter.disabled = !state.navigation?.canPreviousSection;
  const nextChapter = document.querySelector<HTMLButtonElement>('#next-chapter');
  if (nextChapter) nextChapter.disabled = !state.navigation?.canNextSection;
  syncReaderNotice();
  syncReaderDrawer();
}

function syncReaderNotice(): void {
  if (!app || appMode !== 'readerApp' || state.view !== 'reader') return;
  app.querySelector(':scope > .reader-toast')?.remove();
  if (!state.notice) return;
  const notice = element('div', 'reader-toast', state.notice); notice.setAttribute('role', 'status');
  app.append(notice);
}

function showReaderNotice(message: string): void {
  state = readerAppReducer(state, { type: 'showNotice', message });
  syncReaderNotice();
}

function renderTocDrawer(): HTMLElement {
  const drawer = drawerShell('目录');
  const list = element('ol', 'toc-list'); list.setAttribute('aria-label', '书籍目录');
  appendTocNodes(list, state.toc ?? [], 0); drawer.append(list); return drawer;
}
function appendTocNodes(parent: HTMLElement, nodes: NonNullable<typeof state.toc>, depth: number): void {
  nodes.forEach(node => { const item = element('li', 'toc-item');
    const target = button(node.title, node.sectionId === state.activeSectionId ? 'toc-link is-current' : 'toc-link', () => navigateToTarget(node.sectionId, node.fragment));
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
  const header = element('header', 'drawer-header'); header.append(element('h2', undefined, title), iconButton('×', `关闭${title}`, () => dispatch({ type: 'closeDrawer' }))); drawer.append(header); return drawer;
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

function openBook(book: LibraryBookItem): void {
  navigator.clear(); resetSectionContext();
  const requestId = `webview-${Date.now()}-${++requestSequence}`;
  dispatch({ type: 'openReader', book, requestId });
  post({ version: READER_PROTOCOL_VERSION, type: 'openBook', requestId, bookId: book.id });
}
function requestAdjacent(type: 'requestNextSection' | 'requestPreviousSection'): void {
  const id = state.activeSectionId; const before = currentLocation();
  if (!id || !before || pendingNavigation) return;
  pendingNavigation = { kind: 'move', before, edge: type === 'requestPreviousSection' ? 'end' : 'start' };
  post(envelope(type, id));
}
function nextPage(): void {
  const before = currentLocation();
  if (before && layout?.nextPage()) { updateLayout(); commitMovement(before); }
  else if (state.navigation?.canNextSection) requestAdjacent('requestNextSection');
  else dispatch({ type: 'bookBoundary', edge: 'end' });
}
function previousPage(): void {
  const before = currentLocation();
  if (before && layout?.previousPage()) { updateLayout(); commitMovement(before); }
  else if (state.navigation?.canPreviousSection) requestAdjacent('requestPreviousSection');
  else dispatch({ type: 'bookBoundary', edge: 'start' });
}
function updateLayout(): void { if (layout) commitLayout(layout.getState()); }
function commitLayout(current: LayoutState): void {
  state = readerAppReducer(state, { type: 'layoutChanged', ...current });
  const previous = document.querySelector<HTMLButtonElement>('#previous-page'); if (previous) previous.disabled = !state.navigation?.canPreviousPage;
  const next = document.querySelector<HTMLButtonElement>('#next-page'); if (next) next.disabled = !state.navigation?.canNextPage;
  const progress = document.querySelector<HTMLElement>('#page-progress'); if (progress) progress.textContent = formatReadingProgress();
  syncUndoButton(); postNavigationState();
  post({ ...envelope('layoutStable', current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
}
function closeBook(): void {
  if (layout) {
    const current = layout.getState();
    post({ ...envelope('closeBook', current.sectionId), locator: locatorFor(current), bookProgression: wholeBookProgress(current) });
  }
  navigator.clear(); resetSectionContext();
  dispatch({ type: 'closeReader' });
}
function locatorFor(current: LayoutState): Record<string, unknown> { return state.activeBook?.format === 'txt' ? { kind: 'txt', sectionId: current.sectionId, progression: current.progression, offset: current.startOffset } : { kind: 'epub', sectionId: current.sectionId, progression: current.progression, textOffset: current.startOffset, sourceRevision: currentSourceRevision }; }
function wholeBookProgress(current: LayoutState): number { const sections = state.sections ?? []; const total = sections.reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0); const index = sections.findIndex(section => section.id === current.sectionId); if (total <= 0 || index < 0) return 0; const before = sections.slice(0, index).reduce((sum, section) => sum + Math.max(1, section.progressionWeight), 0); return (before + current.progression * Math.max(1, sections[index].progressionWeight)) / total; }

function currentLocation(): ReaderHistoryLocation | undefined {
  const current = layout?.getState();
  if (!current || !currentSourceRevision) return undefined;
  return { sectionId: current.sectionId, textOffset: current.startOffset, progression: current.progression, sourceRevision: currentSourceRevision };
}

function commitMovement(before: ReaderHistoryLocation): void {
  const after = currentLocation();
  if (after) navigator.commit(before, after);
  state = readerAppReducer(state, { type: 'clearNotice' });
  document.querySelector('.reader-toast')?.remove();
  syncUndoButton(); postNavigationState();
}

function navigateToTarget(sectionId: string, fragment?: string): void {
  const before = currentLocation();
  if (!before || pendingNavigation) return;
  if (sectionId === before.sectionId) {
    const offset = fragment ? layout?.resolveFragmentOffset(fragment) : 0;
    if (offset === undefined) { dispatch({ type: 'showNotice', message: '目标位置不可用' }); return; }
    if (layout?.goToOffset(offset)) { updateLayout(); commitMovement(before); }
    return;
  }
  pendingNavigation = { kind: 'move', before, expectedSectionId: sectionId, fragment, edge: 'start' };
  post({ ...envelope('requestSectionTarget', sectionId), ...(fragment ? { fragment } : {}) });
}

async function undoLocation(): Promise<boolean> {
  if (pendingNavigation) return false;
  const restored = await navigator.undo(target => restoreHistoryLocation(target));
  if (!restored) dispatch({ type: 'showNotice', message: '目标位置不可用' });
  syncUndoButton(); postNavigationState();
  return restored;
}

function restoreHistoryLocation(target: ReaderHistoryLocation): Promise<boolean> | boolean {
  if (!layout) return false;
  if (target.sectionId === state.activeSectionId) {
    const offset = target.sourceRevision === currentSourceRevision
      ? target.textOffset
      : target.progression * layout.getTextLength();
    if (!layout.goToOffset(offset)) return true;
    state = readerAppReducer(state, { type: 'clearNotice' });
    document.querySelector('.reader-toast')?.remove();
    updateLayout();
    return true;
  }
  return new Promise(resolve => {
    pendingNavigation = { kind: 'undo', target, expectedSectionId: target.sectionId, resolve };
    post(envelope('requestSectionTarget', target.sectionId));
  });
}

function handleReaderContentClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-moyuplus-resource-id],[data-moyuplus-section-id]') : null;
  if (!target) return;
  event.preventDefault();
  const resourceId = target.dataset.moyuplusResourceId;
  if (resourceId) {
    if (!currentResourceIds.has(resourceId) || currentSectionGeneration <= 0 || !state.activeSectionId) return;
    post({ ...envelope('openImage', state.activeSectionId), sectionGeneration: currentSectionGeneration, resourceId });
    return;
  }
  const sectionId = target.dataset.moyuplusSectionId;
  if (sectionId) navigateToTarget(sectionId, target.dataset.moyuplusFragment);
}

function resolveTargetOffset(html: string, fragment?: string): { totalLength: number; offset?: number } {
  const source = document.createElement('div'); source.innerHTML = html;
  const resolver = new InternalTargetResolver(source as unknown as TextTreeNode);
  return { totalLength: resolver.totalLength, offset: fragment ? resolver.resolveFragment(fragment) : 0 };
}

function prepareSectionLayout(sectionId: string, html: string, textOffset: number): LayoutEngine | undefined {
  const visible = document.querySelector<HTMLElement>('#reader-content');
  if (!visible || !app || visible.clientWidth <= 0 || visible.clientHeight <= 0) return undefined;
  const staging = document.createElement('div');
  staging.className = visible.className;
  for (const [key, value] of Object.entries(visible.dataset)) staging.dataset[key] = value;
  staging.style.cssText = visible.style.cssText;
  Object.assign(staging.style, {
    position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
    width: `${visible.clientWidth}px`, height: `${visible.clientHeight}px`
  });
  app.append(staging);
  const candidate = new LayoutEngine(staging);
  try {
    candidate.setContentAtOffset(sectionId, html, textOffset);
    if (!fitsWithinSurface(staging)) throw new Error('Candidate layout overflowed its staging surface.');
    return candidate;
  } catch {
    candidate.dispose(); staging.remove();
    return undefined;
  }
}

function postNavigationState(): void {
  if (!state.requestId || !state.activeBook || !state.activeSectionId || currentSectionGeneration <= 0) return;
  post({
    ...envelope('navigationState', state.activeSectionId), sectionGeneration: currentSectionGeneration,
    canPreviousPage: Boolean(state.navigation?.canPreviousPage),
    canNextPage: Boolean(state.navigation?.canNextPage),
    canUndoLocation: navigator.canUndo
  });
}

function syncUndoButton(): void {
  const undo = document.querySelector<HTMLButtonElement>('#undo-location');
  if (undo) undo.disabled = !navigator.canUndo;
}

function resetSectionContext(): void {
  pendingNavigation?.resolve?.(false);
  pendingNavigation = undefined;
  initialEpubRestore = undefined;
  currentSectionHtml = ''; currentSectionGeneration = 0; currentSourceRevision = '';
  currentResourceIds = new Set();
}

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
    if (!acceptModeGeneration(event.data.modeGeneration)) return;
    navigator.clear(); resetSectionContext();
    layout?.dispose(); layout = undefined;
    gitLogView?.dispose();
    appMode = 'gitLog';
    gitLogView = new GitLogView(app, post);
    gitLogView.begin(event.data.sessionId, event.data.preferences, event.data.readerPreferences, event.data.cached);
    return;
  }
  if (isModeLibrary(event.data)) {
    if (!acceptModeGeneration(event.data.modeGeneration)) return;
    gitLogView?.dispose(); gitLogView = undefined;
    navigator.clear(); resetSectionContext();
    appMode = 'readerApp';
    if (event.data.message) dispatch({ type: 'showError', message: event.data.message });
    else render();
    return;
  }
  if (isModeReaderRestore(event.data)) {
    if (!acceptModeGeneration(event.data.modeGeneration)) return;
    gitLogView?.dispose(); gitLogView = undefined;
    navigator.clear(); resetSectionContext();
    appMode = 'readerApp';
    state = readerAppReducer(state, {
      type: 'libraryLoaded', books: event.data.books,
      availability: event.data.availability, progress: event.data.progress
    });
    if (event.data.preferences) state = readerAppReducer(state, { type: 'preferencesLoaded', preferences: event.data.preferences });
    dispatch({ type: 'openReader', book: event.data.book, requestId: event.data.requestId });
    return;
  }
  if (isModeInvalidated(event.data)) {
    if (!acceptModeGeneration(event.data.modeGeneration)) return;
    layout?.dispose(); layout = undefined;
    navigator.clear(); resetSectionContext();
    gitLogView?.dispose(); gitLogView = undefined;
    appMode = 'boot';
    render();
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
    else if (command === 'undoLocation') void undoLocation();
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
  if (message.type === 'bookReady') {
    initialEpubRestore = message.initialLocator.kind === 'epub'
      && message.initialLocator.textOffset !== undefined && message.initialLocator.sourceRevision
      ? { textOffset: message.initialLocator.textOffset, sourceRevision: message.initialLocator.sourceRevision }
      : undefined;
    dispatch({ type: 'bookReady', requestId: message.requestId, toc: message.toc, sections: message.sections, initialSectionId: message.initialSectionId, initialProgression: message.initialLocator.progression });
    post(envelope('requestSection', message.initialSectionId)); return;
  }
  if (message.type === 'sectionReady') {
    if (message.sectionGeneration <= currentSectionGeneration) return;
    const pending = pendingNavigation;
    if (pending?.expectedSectionId && pending.expectedSectionId !== message.sectionId) return;
    const target = resolveTargetOffset(message.section.sanitizedHtml, pending?.fragment);
    if (pending?.fragment && target.offset === undefined) {
      pendingNavigation = undefined; pending?.resolve?.(false);
      showReaderNotice('目标位置不可用'); return;
    }
    let targetOffset: number | undefined;
    if (pending?.kind === 'undo' && pending.target) {
      targetOffset = pending.target.sourceRevision === message.section.sourceRevision
        ? pending.target.textOffset : pending.target.progression * target.totalLength;
    } else if (pending?.edge === 'end') targetOffset = target.totalLength;
    else if (pending) targetOffset = target.offset ?? 0;
    else if (initialEpubRestore?.sourceRevision === message.section.sourceRevision) targetOffset = initialEpubRestore.textOffset;
    else targetOffset = (state.initialProgression ?? 0) * target.totalLength;
    const candidate = prepareSectionLayout(message.sectionId, message.section.sanitizedHtml, targetOffset ?? 0);
    if (!candidate) {
      pendingNavigation = undefined; pending?.resolve?.(false);
      if (pending) showReaderNotice('目标位置不可用');
      else dispatch({ type: 'showError', message: '章节载入失败。' });
      return;
    }
    const visible = document.querySelector<HTMLElement>('#reader-content');
    if (!visible) {
      candidate.dispose(); pendingNavigation = undefined; pending?.resolve?.(false);
      if (pending) showReaderNotice('目标位置不可用');
      else dispatch({ type: 'showError', message: '章节载入失败。' });
      return;
    }
    const previousLayout = layout;
    initialEpubRestore = undefined;
    currentSectionHtml = message.section.sanitizedHtml;
    currentSectionGeneration = message.sectionGeneration;
    currentSourceRevision = message.section.sourceRevision;
    currentResourceIds = new Set(message.section.localResources.map(resource => resource.id));
    pendingNavigation = undefined;
    state = readerAppReducer(state, { type: 'selectSection', sectionId: message.sectionId });
    candidate.attachTo(visible, current => commitLayout(current));
    layout = candidate;
    previousLayout?.dispose();
    syncReaderSectionUi();
    commitLayout(candidate.getState());
    if (pending?.kind === 'move' && pending.before) commitMovement(pending.before);
    pending?.resolve?.(true);
    return;
  }
  if (message.type === 'bookStart' || message.type === 'bookEnd') {
    const pending = pendingNavigation; pendingNavigation = undefined; pending?.resolve?.(false);
    dispatch({ type: 'bookBoundary', edge: message.type === 'bookStart' ? 'start' : 'end' }); return;
  }
  if (message.type === 'targetUnavailable') {
    const pending = pendingNavigation; pendingNavigation = undefined; pending?.resolve?.(false);
    showReaderNotice('目标位置不可用'); return;
  }
  if (message.type === 'imageOpenFailed') {
    if (message.sectionGeneration === currentSectionGeneration) dispatch({ type: 'showNotice', message: message.message });
    return;
  }
  if (message.type === 'readerError') {
    const pending = pendingNavigation; pendingNavigation = undefined; pending?.resolve?.(false);
    dispatch({ type: 'showError', message: message.message });
  }
});

function isReaderCommand(value: unknown): value is { type: 'command'; command: 'nextPage' | 'previousPage' | 'undoLocation' | 'nextChapter' | 'previousChapter' | 'openLibrary' | 'openToc' | 'openSettings' } {
  if (typeof value !== 'object' || value === null || (value as { type?: unknown }).type !== 'command') return false;
  return ['nextPage', 'previousPage', 'undoLocation', 'nextChapter', 'previousChapter', 'openLibrary', 'openToc', 'openSettings']
    .includes(String((value as { command?: unknown }).command));
}

function isLibraryLoadError(value: unknown): value is { type: 'libraryLoadError'; message: string } {
  return typeof value === 'object' && value !== null
    && (value as { type?: unknown }).type === 'libraryLoadError'
    && typeof (value as { message?: unknown }).message === 'string';
}

function isModeGitLog(value: unknown): value is {
  type: 'modeGitLog'; sessionId: string; modeGeneration: number; preferences: GitLogPreferences;
  readerPreferences: ReaderPreferences; cached?: Extract<ExtensionToGitLogMessage, { type: 'modeGitLog' }>['cached'];
} {
  return isExtensionToGitLogMessage(value) && value.type === 'modeGitLog';
}

function isModeLibrary(value: unknown): value is { type: 'modeLibrary'; modeGeneration: number; message?: string } {
  return isRecord(value) && value.type === 'modeLibrary' && isModeGeneration(value.modeGeneration)
    && (value.message === undefined || typeof value.message === 'string');
}

function isModeReaderRestore(value: unknown): value is ModeReaderRestoreMessage {
  return isRecord(value) && value.type === 'modeReaderRestore' && isRecord(value.book)
    && Array.isArray(value.books) && value.books.every(isRecord)
    && isRecord(value.availability) && isRecord(value.progress)
    && isModeGeneration(value.modeGeneration) && typeof value.book.id === 'string' && typeof value.requestId === 'string';
}

function isModeInvalidated(value: unknown): value is { type: 'modeInvalidated'; modeGeneration: number } {
  return isRecord(value) && value.type === 'modeInvalidated' && isModeGeneration(value.modeGeneration);
}

function isModeGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function acceptModeGeneration(generation: number): boolean {
  if (generation <= acceptedModeGeneration) return false;
  acceptedModeGeneration = generation;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

render(); post({ type: 'appReady' });
