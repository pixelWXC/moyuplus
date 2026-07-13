import type { ReaderPreferences } from '../domain/readerPreferences';
import type { ExtensionToGitLogMessage } from '../git/gitLogMessages';
import { createDefaultGitLogPreferences, type GitLogCommit, type GitLogPreferences } from '../git/gitLogModels';
import { GitLogPaginator, type GitLogPageState } from './gitLogPaginator';
import { createInitialGitLogState, gitLogReducer, type GitLogAction, type GitLogState } from './gitLogState';
import { applyReaderPreferences } from './readerPreferenceStyles';

export class GitLogView {
  private state: GitLogState = createInitialGitLogState();
  private readerPreferences?: ReaderPreferences;
  private paginator?: GitLogPaginator;

  constructor(private readonly root: HTMLElement, private readonly post: (message: unknown) => void) {}

  begin(sessionId: string, preferences: GitLogPreferences, readerPreferences: ReaderPreferences): void {
    this.readerPreferences = readerPreferences;
    this.reduce({ type: 'begin', sessionId }, false);
    this.reduce({ type: 'preferencesLoaded', preferences }, false);
    this.render();
  }

  receive(message: ExtensionToGitLogMessage): void {
    if (message.type === 'gitLogReady') {
      this.reduce({ type: 'ready', sessionId: message.sessionId, repositoryName: message.repositoryName,
        branchName: message.branchName, detached: message.detached, commits: message.commits });
    } else if (message.type === 'gitLogError') {
      this.reduce({ type: 'error', sessionId: message.sessionId, message: localError(message.code, message.message) });
    } else if (message.type === 'gitLogInvalidated') {
      this.reduce({ type: 'invalidate', sessionId: message.sessionId });
    }
  }

  dispose(): void {
    this.paginator?.dispose();
    this.paginator = undefined;
    this.state = createInitialGitLogState();
    this.readerPreferences = undefined;
  }

  private reduce(action: GitLogAction, render = true): void {
    this.state = gitLogReducer(this.state, action);
    if (render) this.render();
  }

  private render(): void {
    this.paginator?.dispose();
    this.paginator = undefined;
    this.root.className = 'git-log-view';
    this.root.replaceChildren();

    const toolbar = node('header', 'reader-toolbar git-log-toolbar');
    toolbar.append(node('strong', 'reader-title', 'Git Log'));
    const tools = node('div', 'reader-tools');
    tools.append(iconButton('Aa', 'Git Log 设置', () => this.reduce({ type: 'openSettings' })));
    toolbar.append(tools);

    const context = node('div', 'chapter-bar git-log-context');
    context.append(node('span', 'chapter-title', this.contextLabel()));
    const viewport = node('main', 'reader-content git-log-content');
    viewport.id = 'git-log-content';
    viewport.tabIndex = 0;
    if (this.readerPreferences) applyReaderPreferences(viewport, this.readerPreferences);

    const footer = node('footer', 'reader-footer git-log-footer');
    const previous = button('上一页', 'page-action', () => this.movePrevious(), true); previous.id = 'git-log-previous-page';
    const progress = node('span', 'page-progress', '—'); progress.id = 'git-log-page-progress';
    const next = button('下一页', 'page-action', () => this.moveNext(), true); next.id = 'git-log-next-page';
    footer.append(previous, progress, next);
    this.root.append(toolbar, context, viewport, footer);

    if (this.state.status === 'loading') viewport.append(node('p', 'notice', '正在读取当前分支…'));
    else if (this.state.status === 'error') viewport.append(node('p', 'notice notice-error', this.state.error ?? '无法读取 Git 历史。'));
    else if (this.state.status === 'empty') viewport.append(node('p', 'notice', '当前分支没有提交。'));
    else if (this.state.status === 'ready') {
      this.paginator = new GitLogPaginator(viewport, page => this.commitPage(page));
      this.paginator.setContent(this.commitContent());
    }
    if (this.state.settingsOpen) this.root.append(this.settingsDrawer());
  }

  private contextLabel(): string {
    if (!this.state.repositoryName && !this.state.branchName) return '当前工作区 · 当前分支';
    return `${this.state.repositoryName ?? '工作区'} · ${this.state.detached ? 'detached ' : ''}${this.state.branchName ?? 'HEAD'}`;
  }

  private commitContent(): HTMLElement {
    const content = node('div', `git-log-document git-layout-${this.state.preferencesDraft.layout}`);
    for (const commit of this.state.commits) content.append(this.commitEntry(commit));
    return content;
  }

  private commitEntry(commit: GitLogCommit): HTMLElement {
    const entry = node('article', 'git-commit');
    const values = [commit.subject, ...this.optionalValues(commit)];
    if (this.state.preferencesDraft.layout === 'inline') {
      entry.append(node('span', 'git-commit-line', values.join(' · ')));
    } else {
      for (const value of values) entry.append(node('span', 'git-commit-line', value));
    }
    return entry;
  }

  private optionalValues(commit: GitLogCommit): string[] {
    const preferences = this.state.preferencesDraft;
    const values: string[] = [];
    if (preferences.showHash) values.push(commit.hash.slice(0, 8));
    if (preferences.showAuthor) values.push(commit.author);
    if (preferences.showRelativeTime) values.push(relativeTime(commit.authoredAt));
    if (preferences.showAbsoluteDate) values.push(absoluteDate(commit.authoredAt));
    return values;
  }

  private commitPage(page: GitLogPageState): void {
    this.state = gitLogReducer(this.state, { type: 'pageChanged', pageIndex: page.pageIndex, pageCount: page.pageCount });
    const previous = this.root.querySelector<HTMLButtonElement>('#git-log-previous-page');
    const next = this.root.querySelector<HTMLButtonElement>('#git-log-next-page');
    const progress = this.root.querySelector<HTMLElement>('#git-log-page-progress');
    if (previous) previous.disabled = !page.canPreviousPage;
    if (next) next.disabled = !page.canNextPage;
    if (progress) progress.textContent = `${page.pageIndex + 1} / ${page.pageCount}`;
  }

  private movePrevious(): void { this.paginator?.previousPage(); }
  private moveNext(): void { this.paginator?.nextPage(); }

  private settingsDrawer(): HTMLElement {
    const view = this;
    const drawer = node('aside', 'reader-drawer git-log-settings'); drawer.setAttribute('aria-label', 'Git Log 设置');
    const header = node('header', 'drawer-header');
    header.append(node('h2', undefined, 'Git Log 设置'), iconButton('×', '关闭 Git Log 设置', () => this.reduce({ type: 'closeSettings' })));
    const form = node('form', 'settings-form');
    form.append(
      checkField('显示 Hash', 'showHash'),
      checkField('显示作者', 'showAuthor'),
      checkField('显示相对时间', 'showRelativeTime'),
      checkField('显示日期', 'showAbsoluteDate'),
      selectField('提交内排列', 'layout', [['lines', '逐项换行'], ['inline', '标点分隔']]),
      rangeField('最多加载', 'maxCommits', 20, 1000, 20)
    );
    const actions = node('div', 'settings-actions');
    actions.append(button('恢复默认', 'subtle-button', () => {
      this.state = gitLogReducer(this.state, { type: 'previewPreferences', patch: createDefaultGitLogPreferences() });
      this.render();
    }), button('保存', 'primary-action', () => {
      const preferences = this.state.preferencesDraft;
      this.state = gitLogReducer(this.state, { type: 'preferencesSaved' });
      this.post({ type: 'saveGitLogPreferences', preferences });
      this.render();
    }));
    form.append(actions); drawer.append(header, form); return drawer;

    function checkField(label: string, key: BooleanPreference): HTMLElement {
      const field = node('label', 'setting-field git-check-field');
      const input = node('input') as HTMLInputElement; input.type = 'checkbox'; input.checked = Boolean(view.state.preferencesDraft[key]);
      input.addEventListener('change', () => preview({ [key]: input.checked }));
      field.append(node('span', undefined, label), input); return field;
    }
    function selectField(label: string, key: 'layout', options: string[][]): HTMLElement {
      const field = node('label', 'setting-field'); const select = node('select') as HTMLSelectElement;
      for (const [value, text] of options) { const option = node('option', undefined, text) as HTMLOptionElement; option.value = value; option.selected = view.state.preferencesDraft[key] === value; select.append(option); }
      select.addEventListener('change', () => preview({ [key]: select.value as GitLogPreferences['layout'] }));
      field.append(node('span', undefined, label), select); return field;
    }
    function rangeField(label: string, key: 'maxCommits', min: number, max: number, step: number): HTMLElement {
      const field = node('label', 'setting-field range-field'); const value = view.state.preferencesDraft[key];
      const input = node('input') as HTMLInputElement; Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
      input.addEventListener('input', () => preview({ [key]: Number(input.value) }));
      field.append(node('span', undefined, `${label} ${value}`), input); return field;
    }
    function preview(patch: Partial<GitLogPreferences>): void { view.reduce({ type: 'previewPreferences', patch }); }
  }
}

type BooleanPreference = 'showHash' | 'showAuthor' | 'showRelativeTime' | 'showAbsoluteDate';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const target = document.createElement(tag); if (className) target.className = className; if (text !== undefined) target.textContent = text; return target;
}
function button(label: string, className: string, handler: () => void, disabled = false): HTMLButtonElement {
  const target = node('button', className, label); target.type = 'button'; target.disabled = disabled; target.addEventListener('click', handler); return target;
}
function iconButton(label: string, ariaLabel: string, handler: () => void): HTMLButtonElement {
  const target = button(label, 'icon-button', handler); target.setAttribute('aria-label', ariaLabel); target.title = ariaLabel; return target;
}
function relativeTime(seconds: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (delta < 60) return '刚刚';
  if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} 小时前`;
  if (delta < 86400 * 30) return `${Math.floor(delta / 86400)} 天前`;
  if (delta < 86400 * 365) return `${Math.floor(delta / (86400 * 30))} 个月前`;
  return `${Math.floor(delta / (86400 * 365))} 年前`;
}
function absoluteDate(seconds: number): string {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(seconds * 1000));
}
function localError(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    noWorkspace: '请先打开一个工作区。', notGitRepository: '当前工作区不是 Git 仓库。', gitUnavailable: '无法使用 Git。',
    noCommits: '当前分支没有提交。', queryTimedOut: '读取 Git 历史超时。', queryFailed: '无法读取 Git 历史。'
  };
  return messages[code] ?? fallback;
}
