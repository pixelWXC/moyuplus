import './settingsStyles.css';
import { SETTINGS_PROTOCOL_VERSION, type SettingsDomain, type SettingsSection } from '../settings/settingsMessages';
import { createShortcutSettingsState } from '../shortcuts/shortcutSettings';
import {
  createInitialSettingsState,
  settingsReducer,
  type SettingsSnapshot,
  type SettingsState
} from './settingsState';

interface VsCodeApi { postMessage(message: unknown): void }
declare global { interface Window { acquireVsCodeApi?: () => VsCodeApi } }

const vscode = window.acquireVsCodeApi?.();
const app = document.querySelector<HTMLElement>('#app');
const instanceId = `settings-${crypto.randomUUID().replace(/-/g, '')}`;
let state: SettingsState = createInitialSettingsState(instanceId);
let requestSequence = 0;
let clientRevision = 0;
let userSelectedSection = false;
const rangeTimers = new Map<string, number>();
const rangeAdjustmentKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

interface ActiveRangeSession {
  readonly domain: SettingsDomain;
  readonly key: string;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
  readonly unit: string;
  pointerActive: boolean;
  keyboardActive: boolean;
  fallbackActive: boolean;
  pending: boolean;
  deferredRender: boolean;
  lastSubmittedValue?: number;
}

let activeRangeSession: ActiveRangeSession | undefined;

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'reader', label: '阅读' },
  { id: 'immersive', label: '沉浸阅读' },
  { id: 'gitLog', label: 'Git Log' },
  { id: 'shortcuts', label: '快捷键' }
];

vscode?.postMessage({ type: 'settingsReady', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId });
render();

window.addEventListener('message', event => {
  const message = event.data;
  if (!isRecord(message)) return;
  if (message.type === 'settingsProtocolError' && typeof message.message === 'string') {
    state = settingsReducer(state, { type: 'protocolError', message: message.message });
    renderOrDefer();
    return;
  }
  if (message.type === 'settingsSnapshotError' && message.instanceId === instanceId) {
    state = { ...state, phase: 'loading', error: typeof message.message === 'string' ? message.message : '设置读取失败，请重试。' };
    renderOrDefer();
    return;
  }
  if (message.type === 'settingsSnapshot' && isSnapshot(message)) {
    const wasReady = state.phase === 'ready';
    const previousSection = state.section;
    state = settingsReducer(state, { type: 'snapshotReceived', snapshot: message });
    const focusHeading = state.phase === 'ready' && (!wasReady || state.section !== previousSection) && !userSelectedSection;
    renderOrDefer(focusHeading, userSelectedSection);
    userSelectedSection = false;
    return;
  }
  if ((message.type === 'changeSaved' || message.type === 'changeFailed') && isChangeResponse(message)) {
    const id = `${message.domain}.${message.key}`;
    const pending = state.pending[id];
    const latest = pending?.requestId === message.requestId && pending.clientRevision === message.clientRevision;
    state = settingsReducer(state, { ...message, type: message.type });
    if (activeRangeSession) {
      const session = activeRangeSession;
      if (session.domain === message.domain && session.key === message.key) {
        session.pending = state.pending[id] !== undefined;
        if (latest && message.type === 'changeFailed' && !rangeInteractionActive(session)) {
          syncRangeValue(session, message.value);
        }
        syncSaveStatus();
        scheduleRangeSessionFinish();
      } else {
        session.deferredRender = true;
      }
    } else {
      render();
    }
    return;
  }
  if (message.type === 'sectionReset' && message.instanceId === instanceId
    && (message.section === 'reader' || message.section === 'immersive' || message.section === 'gitLog')
    && typeof message.stateVersion === 'number') {
    state = settingsReducer(state, {
      type: 'sectionReset', section: message.section, value: message.value as never, stateVersion: message.stateVersion
    });
    renderOrDefer();
    return;
  }
  if ((message.type === 'sectionResetFailed' || message.type === 'keyboardShortcutsFailed')
    && message.instanceId === instanceId) {
    if (message.type === 'sectionResetFailed' && (message.section === 'reader' || message.section === 'immersive' || message.section === 'gitLog')) {
      state = settingsReducer(state, {
        type: 'resetFailed', section: message.section,
        message: typeof message.message === 'string' ? message.message : '恢复默认值失败，请重试。'
      });
    } else {
      state = { ...state, saveStatus: 'error', error: typeof message.message === 'string' ? message.message : '操作失败，请重试。' };
    }
    renderOrDefer();
  }
});

function renderOrDefer(focusHeading = false, focusNavigation = false): void {
  if (activeRangeSession) {
    activeRangeSession.deferredRender = true;
    syncSaveStatus();
    return;
  }
  render(focusHeading, focusNavigation);
}

function render(focusHeading = false, focusNavigation = false): void {
  if (!app) return;
  app.replaceChildren();
  if (state.phase === 'loading') {
    const loading = node('section', 'blocking-state');
    loading.append(node('h1', undefined, 'MoyuPlus Settings'), node('p', undefined, state.error ?? '正在读取设置…'));
    if (state.error) loading.append(actionButton('重试', () => postSimple('retrySnapshot')));
    app.append(loading);
    return;
  }
  if (state.phase === 'protocolError') {
    const error = node('section', 'blocking-state'); error.setAttribute('role', 'alert');
    error.append(node('h1', undefined, '设置无法载入'), node('p', undefined, state.error ?? '请重新加载窗口或更新扩展。'));
    app.append(error); return;
  }

  const header = node('header', 'settings-header');
  const title = node('div', 'settings-title');
  title.append(node('h1', undefined, 'MoyuPlus Settings'), node('p', undefined, '设置会自动保存'));
  const status = node('div', `save-status ${state.saveStatus ? `is-${state.saveStatus}` : ''}`, statusText());
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  header.append(title, status);

  const mobile = node('label', 'mobile-section-picker');
  mobile.append(node('span', undefined, '设置分区'));
  const select = node('select') as HTMLSelectElement;
  for (const section of sections) {
    const option = node('option', undefined, section.label) as HTMLOptionElement;
    option.value = section.id; option.selected = section.id === state.section; select.append(option);
  }
  select.addEventListener('change', () => selectSection(select.value as SettingsSection));
  mobile.append(select);

  const shell = node('div', 'settings-shell');
  const navigation = node('nav', 'section-navigation'); navigation.setAttribute('aria-label', '设置分区');
  for (const section of sections) {
    const button = actionButton(section.label, () => selectSection(section.id), 'section-link');
    button.setAttribute('aria-current', section.id === state.section ? 'page' : 'false');
    navigation.append(button);
  }
  const content = node('main', 'settings-content');
  content.append(renderSection());
  shell.append(navigation, content);
  app.append(header, mobile, shell);
  if (focusHeading) requestAnimationFrame(() => document.querySelector<HTMLElement>('#settings-section-title')?.focus());
  else if (focusNavigation) requestAnimationFrame(() => {
    const mobileSelect = document.querySelector<HTMLSelectElement>('.mobile-section-picker select');
    const navigationButton = document.querySelector<HTMLButtonElement>('.section-link[aria-current="page"]');
    const target = mobileSelect && getComputedStyle(mobileSelect.closest('.mobile-section-picker')!).display !== 'none'
      ? mobileSelect : navigationButton;
    target?.focus();
  });
}

function syncSaveStatus(): void {
  const status = document.querySelector<HTMLElement>('.save-status');
  if (!status) return;
  status.className = `save-status ${state.saveStatus ? `is-${state.saveStatus}` : ''}`;
  status.textContent = statusText();
}

function rangeInteractionActive(session: ActiveRangeSession): boolean {
  return session.pointerActive || session.keyboardActive || session.fallbackActive;
}

function scheduleRangeSessionFinish(): void {
  window.setTimeout(finishRangeSession, 0);
}

function finishRangeSession(): void {
  const session = activeRangeSession;
  if (!session || rangeInteractionActive(session) || session.pending || rangeTimers.has(rangeId(session.domain, session.key))) return;
  const shouldRender = session.deferredRender;
  const scrollY = window.scrollY;
  const restoreFocus = document.activeElement === session.input;
  const control = session.input.id;
  activeRangeSession = undefined;
  if (!shouldRender) return;
  render();
  window.scrollTo(0, scrollY);
  if (restoreFocus) document.getElementById(control)?.focus({ preventScroll: true });
}

function beginRangeSession(
  domain: SettingsDomain,
  key: string,
  input: HTMLInputElement,
  output: HTMLOutputElement,
  unit: string
): ActiveRangeSession {
  if (activeRangeSession?.input === input) return activeRangeSession;
  activeRangeSession = {
    domain, key, input, output, unit,
    pointerActive: false, keyboardActive: false, fallbackActive: false,
    pending: false, deferredRender: false
  };
  return activeRangeSession;
}

function syncRangeValue(session: ActiveRangeSession, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  session.input.value = String(value);
  session.output.value = `${value}${session.unit}`;
}

function rangeId(domain: SettingsDomain, key: string): string {
  return `${domain}.${key}`;
}

function clearRangeTimer(id: string): void {
  const timer = rangeTimers.get(id);
  if (timer !== undefined) window.clearTimeout(timer);
  rangeTimers.delete(id);
}

function cancelRangeWork(): void {
  for (const timer of rangeTimers.values()) window.clearTimeout(timer);
  rangeTimers.clear();
  activeRangeSession = undefined;
}

function renderSection(): HTMLElement {
  if (state.section === 'reader') return renderReader();
  if (state.section === 'immersive') return renderImmersive();
  if (state.section === 'gitLog') return renderGitLog();
  return renderShortcuts();
}

function renderImmersive(): HTMLElement {
  const root = sectionRoot('沉浸阅读', '控制附加在代码行末尾的纯文本分页与外观。');
  const preview = node('div', 'immersive-preview');
  preview.setAttribute('aria-label', '沉浸阅读效果示意');
  const previewText = node('span', 'preview-code', 'const focus = true;');
  const previewAfter = node('span', 'preview-after', '在代码旁安静地继续阅读');
  previewAfter.style.color = state.immersive.textColor === 'theme' ? 'var(--vscode-editorCodeLens-foreground, var(--vscode-descriptionForeground))' : state.immersive.textColor;
  previewAfter.style.backgroundColor = state.immersive.backgroundColor === 'transparent' ? 'transparent' : state.immersive.backgroundColor;
  previewAfter.style.fontWeight = state.immersive.fontWeight;
  previewAfter.style.fontStyle = state.immersive.italic ? 'italic' : 'normal';
  previewAfter.style.marginLeft = `${state.immersive.leftMargin}px`;
  preview.append(previewText, previewAfter);

  const fields = node('div', 'settings-fields');
  fields.append(
    rangeField('每页视觉行数', 'immersive', 'visualLines', state.immersive.visualLines, 1, 12, 1, ' 行'),
    rangeField('每行最大字形簇数', 'immersive', 'graphemesPerLine', state.immersive.graphemesPerLine, 8, 160, 1),
    immersiveColorField('文字颜色', 'textColor', state.immersive.textColor, 'theme'),
    immersiveColorField('背景颜色', 'backgroundColor', state.immersive.backgroundColor, 'transparent'),
    selectField('字重', 'immersive', 'fontWeight', state.immersive.fontWeight, [['normal', '常规'], ['500', '中等'], ['600', '半粗'], ['bold', '粗体']]),
    toggleField('使用斜体', 'immersive', 'italic', state.immersive.italic),
    rangeField('与代码文本的左侧间距', 'immersive', 'leftMargin', state.immersive.leftMargin, 0, 64, 1, 'px')
  );
  root.append(preview, fields, resetButton('immersive', '恢复沉浸阅读默认值'));
  return root;
}

function sectionRoot(title: string, description: string): HTMLElement {
  const section = node('section', 'settings-section');
  const heading = node('h2', undefined, title); heading.id = 'settings-section-title'; heading.tabIndex = -1;
  section.append(heading, node('p', 'section-description', description));
  return section;
}

function renderReader(): HTMLElement {
  const root = sectionRoot('阅读', '全局应用到 MoyuPlus Reader 与 Git Log 正文。');
  const fields = node('div', 'settings-fields');
  fields.append(
    selectField('主题', 'reader', 'theme', state.reader.theme, [['system', '跟随 VS Code'], ['light', '明亮'], ['sepia', '纸张'], ['dark', '深色']]),
    selectField('字体', 'reader', 'fontFamily', state.reader.fontFamily, [['system', 'VS Code'], ['serif', '衬线'], ['sans-serif', '无衬线']]),
    rangeField('字号', 'reader', 'fontSize', state.reader.fontSize, 12, 32, 1, 'px'),
    rangeField('行高', 'reader', 'lineHeight', state.reader.lineHeight, 1.2, 2.4, .1),
    rangeField('字间距', 'reader', 'letterSpacing', state.reader.letterSpacing, -.05, .2, .01, 'em'),
    rangeField('段间距', 'reader', 'paragraphSpacing', state.reader.paragraphSpacing, 0, 3, .25, 'em'),
    colorField('文字颜色', 'textColor', state.reader.textColor),
    colorField('背景颜色', 'backgroundColor', state.reader.backgroundColor),
    rangeField('页面边距', 'reader', 'pagePadding', state.reader.pagePadding, 8, 64, 2, 'px'),
    selectField('对齐方式', 'reader', 'textAlign', state.reader.textAlign, [['left', '左对齐'], ['justify', '两端对齐']])
  );
  root.append(fields, resetButton('reader', '恢复阅读默认值'));
  return root;
}

function renderGitLog(): HTMLElement {
  const root = sectionRoot('Git Log', '控制提交字段、排列方式与每次加载数量。');
  const fields = node('div', 'settings-fields');
  fields.append(
    toggleField('显示提交哈希', 'gitLog', 'showHash', state.gitLog.showHash),
    toggleField('显示作者', 'gitLog', 'showAuthor', state.gitLog.showAuthor),
    toggleField('显示相对时间', 'gitLog', 'showRelativeTime', state.gitLog.showRelativeTime),
    toggleField('显示绝对日期', 'gitLog', 'showAbsoluteDate', state.gitLog.showAbsoluteDate),
    selectField('排列方式', 'gitLog', 'layout', state.gitLog.layout, [['lines', '分行'], ['inline', '行内']]),
    rangeField('最大提交数量', 'gitLog', 'maxCommits', state.gitLog.maxCommits, 20, 1000, 10)
  );
  root.append(fields, resetButton('gitLog', '恢复 Git Log 默认值'));
  return root;
}

function renderShortcuts(): HTMLElement {
  const root = sectionRoot('快捷键', '按键配置、冲突检查和删除由 VS Code 的键盘快捷方式界面负责。');
  const shortcuts = createShortcutSettingsState();
  const groups: Array<{ title: string; test: (command: string) => boolean }> = [
    { title: '阅读', test: command => command.startsWith('moyuplus.reader.') },
    { title: 'Git Log', test: command => command.includes('gitLog') }
  ];
  for (const group of groups) {
    const list = node('div', 'shortcut-list');
    for (const shortcut of shortcuts.filter(item => group.test(item.commandId))) {
      const row = node('div', 'shortcut-row');
      const copy = node('div');
      copy.append(node('strong', undefined, shortcut.label), node('p', undefined, shortcut.description));
      row.append(copy);
      list.append(row);
    }
    if (list.childElementCount) root.append(node('h3', undefined, group.title), list);
  }
  root.append(actionButton('在键盘快捷方式中配置 MoyuPlus', openKeyboardShortcuts, 'primary-button'));
  return root;
}

function selectField(labelText: string, domain: SettingsDomain, key: string, value: string, options: string[][]): HTMLElement {
  const field = fieldShell(labelText, domain, key);
  const select = node('select') as HTMLSelectElement; select.id = controlId(domain, key);
  select.disabled = isControlPending(domain, key);
  for (const [optionValue, text] of options) {
    const option = node('option', undefined, text) as HTMLOptionElement;
    option.value = optionValue; option.selected = optionValue === value; select.append(option);
  }
  select.addEventListener('change', () => change(domain, key, select.value));
  field.append(select); return field;
}

function toggleField(labelText: string, domain: SettingsDomain, key: string, value: boolean): HTMLElement {
  const field = node('label', 'setting-field toggle-field');
  const input = node('input') as HTMLInputElement;
  input.type = 'checkbox'; input.checked = value; input.id = controlId(domain, key);
  input.disabled = isControlPending(domain, key);
  input.addEventListener('change', () => change(domain, key, input.checked));
  field.append(input, node('span', undefined, labelText)); return field;
}

function rangeField(labelText: string, domain: SettingsDomain, key: string, value: number, min: number, max: number, step: number, unit = ''): HTMLElement {
  const field = fieldShell(labelText, domain, key);
  const row = node('div', 'range-control');
  const input = node('input') as HTMLInputElement;
  Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.id = controlId(domain, key);
  input.disabled = isControlPending(domain, key);
  const output = node('output', undefined, `${value}${unit}`); output.htmlFor.add(input.id);
  const id = rangeId(domain, key);
  const session = () => beginRangeSession(domain, key, input, output, unit);
  const commit = () => {
    clearRangeTimer(id);
    const current = session();
    const next = Number(input.value);
    if (current.lastSubmittedValue === next) {
      scheduleRangeSessionFinish();
      return;
    }
    current.lastSubmittedValue = next;
    current.pending = true;
    change(domain, key, next, false);
  };
  input.addEventListener('pointerdown', () => { session().pointerActive = true; });
  input.addEventListener('pointerup', () => {
    const current = session(); current.pointerActive = false; current.fallbackActive = false; scheduleRangeSessionFinish();
  });
  input.addEventListener('pointercancel', () => {
    const current = session(); current.pointerActive = false; current.fallbackActive = false; scheduleRangeSessionFinish();
  });
  input.addEventListener('keydown', event => { if (rangeAdjustmentKeys.has(event.key)) session().keyboardActive = true; });
  input.addEventListener('keyup', event => {
    if (!rangeAdjustmentKeys.has(event.key)) return;
    const current = session(); current.keyboardActive = false; current.fallbackActive = false; scheduleRangeSessionFinish();
  });
  input.addEventListener('blur', () => {
    const current = session(); current.keyboardActive = false; current.fallbackActive = false; scheduleRangeSessionFinish();
  });
  input.addEventListener('input', () => {
    output.value = `${input.value}${unit}`;
    const current = session();
    if (!current.pointerActive && !current.keyboardActive) current.fallbackActive = true;
    clearRangeTimer(id);
    rangeTimers.set(id, window.setTimeout(commit, 250));
  });
  input.addEventListener('change', () => {
    const current = session(); current.fallbackActive = false;
    commit();
    scheduleRangeSessionFinish();
  });
  row.append(input, output); field.append(row); return field;
}

function colorField(labelText: string, key: string, value: string): HTMLElement {
  const field = fieldShell(labelText, 'reader', key);
  const row = node('div', 'color-control');
  const inherited = value === 'theme';
  const color = node('input') as HTMLInputElement;
  color.type = 'color'; color.value = inherited ? inheritedReaderColor(key) : value; color.id = controlId('reader', key);
  const text = node('input') as HTMLInputElement;
  text.type = 'text'; text.value = inherited ? '' : value; text.placeholder = '跟随主题';
  text.pattern = '#[0-9a-fA-F]{6}'; text.setAttribute('aria-label', `${labelText}十六进制值`);
  const reset = actionButton('跟随主题', () => change('reader', key, 'theme'), 'inline-button');
  reset.setAttribute('aria-label', `${labelText}恢复跟随主题`);
  const pending = isControlPending('reader', key);
  color.disabled = text.disabled = pending;
  reset.disabled = pending || inherited;
  color.addEventListener('change', () => change('reader', key, color.value.toLowerCase()));
  text.addEventListener('change', () => { if (text.validity.valid) change('reader', key, text.value.toLowerCase()); });
  row.append(color, text, reset, node('span', 'color-source', inherited ? '当前：跟随主题' : `当前：${value}`));
  field.append(row); return field;
}

function immersiveColorField(labelText: string, key: 'textColor' | 'backgroundColor', value: string, inheritedValue: 'theme' | 'transparent'): HTMLElement {
  const domain: SettingsDomain = 'immersive';
  const field = fieldShell(labelText, domain, key);
  const row = node('div', 'color-control');
  const inherited = value === inheritedValue;
  const fallbackVariable = key === 'textColor' ? '--vscode-editorCodeLens-foreground' : '--vscode-editor-background';
  const fallback = canonicalCssColor(getComputedStyle(document.documentElement).getPropertyValue(fallbackVariable)) ?? '#808080';
  const color = node('input') as HTMLInputElement;
  color.type = 'color'; color.value = inherited ? fallback : value; color.id = controlId(domain, key);
  const text = node('input') as HTMLInputElement;
  text.type = 'text'; text.value = inherited ? '' : value; text.placeholder = inheritedValue === 'theme' ? '跟随主题' : '透明';
  text.pattern = '#[0-9a-fA-F]{6}'; text.setAttribute('aria-label', `${labelText}十六进制值`);
  const resetLabel = inheritedValue === 'theme' ? '跟随主题' : '透明';
  const reset = actionButton(resetLabel, () => change(domain, key, inheritedValue), 'inline-button');
  reset.setAttribute('aria-label', `${labelText}恢复${resetLabel}`);
  const pending = isControlPending(domain, key);
  color.disabled = text.disabled = pending; reset.disabled = pending || inherited;
  color.addEventListener('change', () => change(domain, key, color.value.toLowerCase()));
  text.addEventListener('change', () => { if (text.validity.valid) change(domain, key, text.value.toLowerCase()); });
  row.append(color, text, reset, node('span', 'color-source', inherited ? `当前：${resetLabel}` : `当前：${value}`));
  field.append(row);
  return field;
}

function inheritedReaderColor(key: string): string {
  const presets: Record<string, { textColor: string; backgroundColor: string }> = {
    light: { textColor: '#1f2328', backgroundColor: '#ffffff' },
    sepia: { textColor: '#4a3b2a', backgroundColor: '#f3ead7' },
    dark: { textColor: '#d6d4d1', backgroundColor: '#1e1e1e' }
  };
  const preset = presets[state.reader.theme];
  if (preset) return preset[key as 'textColor' | 'backgroundColor'];
  const variable = key === 'textColor' ? '--vscode-editor-foreground' : '--vscode-editor-background';
  return canonicalCssColor(getComputedStyle(document.documentElement).getPropertyValue(variable)) ?? '#000000';
}

function canonicalCssColor(value: string): string | undefined {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  if (short) return `#${[...short[1]].map(digit => digit.repeat(2)).join('')}`.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(hex);
  if (!rgb) return undefined;
  return `#${rgb.slice(1, 4).map(part => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('')}`;
}

function fieldShell(labelText: string, domain: SettingsDomain, key: string): HTMLElement {
  const field = node('label', 'setting-field');
  field.htmlFor = controlId(domain, key); field.append(node('span', 'setting-label', labelText)); return field;
}

function resetButton(section: 'reader' | 'immersive' | 'gitLog', label: string): HTMLButtonElement {
  const button = actionButton(label, () => {
    cancelRangeWork();
    const request = requestEnvelope();
    state = settingsReducer(state, { type: 'resetStarted', section });
    render();
    vscode?.postMessage({ ...request, type: 'resetSection', section });
  }, 'secondary-button');
  button.disabled = state.resettingSection === section;
  return button;
}

function change(domain: SettingsDomain, key: string, value: unknown, shouldRender = true): void {
  const request = requestEnvelope();
  state = settingsReducer(state, { type: 'localChange', domain, key, value, requestId: request.requestId, clientRevision: request.clientRevision });
  if (shouldRender) renderOrDefer();
  else syncSaveStatus();
  vscode?.postMessage({ ...request, type: 'changeSetting', domain, key, value });
}

function selectSection(section: SettingsSection): void {
  cancelRangeWork();
  userSelectedSection = true;
  state = settingsReducer(state, { type: 'selectSection', section });
  render(false, true);
  vscode?.postMessage({ type: 'selectSection', protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId, section });
}

window.addEventListener('beforeunload', cancelRangeWork);

function openKeyboardShortcuts(): void {
  vscode?.postMessage({ ...requestEnvelope(), type: 'openKeyboardShortcuts' });
}

function postSimple(type: 'retrySnapshot'): void {
  vscode?.postMessage({ type, protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId });
}

function requestEnvelope(): { protocolVersion: typeof SETTINGS_PROTOCOL_VERSION; instanceId: string; requestId: string; clientRevision: number } {
  clientRevision += 1;
  return { protocolVersion: SETTINGS_PROTOCOL_VERSION, instanceId, requestId: `settings-${Date.now()}-${++requestSequence}`, clientRevision };
}

function statusText(): string {
  if (state.saveStatus === 'saving') return '正在保存…';
  if (state.saveStatus === 'saved') return '✓ 已保存';
  if (state.saveStatus === 'error') return state.error ?? '保存失败，请重试。';
  return '';
}

function actionButton(text: string, action: () => void, className = ''): HTMLButtonElement {
  const button = node('button', className, text) as HTMLButtonElement; button.type = 'button'; button.addEventListener('click', action); return button;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag); if (className) value.className = className; if (text !== undefined) value.textContent = text; return value;
}

function controlId(domain: SettingsDomain, key: string): string { return `${domain}-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`; }
function isControlPending(domain: SettingsDomain, key: string): boolean {
  if (domain === 'reader' && state.resettingSection === 'reader') return true;
  if (domain === 'immersive' && state.resettingSection === 'immersive') return true;
  if (domain === 'gitLog' && state.resettingSection === 'gitLog') return true;
  return state.pending[`${domain}.${key}`] !== undefined;
}
function isRecord(value: unknown): value is Record<string, any> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isSnapshot(value: Record<string, any>): value is SettingsSnapshot {
  return value.protocolVersion === SETTINGS_PROTOCOL_VERSION && value.instanceId === instanceId
    && Number.isSafeInteger(value.stateVersion) && value.stateVersion > 0
    && sections.some(section => section.id === value.section)
    && isRecord(value.reader) && isRecord(value.immersive) && isRecord(value.gitLog);
}
function isChangeResponse(value: Record<string, any>): value is Extract<Parameters<typeof settingsReducer>[1], { type: 'changeSaved' | 'changeFailed' }> {
  return value.instanceId === instanceId && Number.isSafeInteger(value.stateVersion)
    && typeof value.requestId === 'string' && Number.isSafeInteger(value.clientRevision)
    && (value.domain === 'reader' || value.domain === 'immersive' || value.domain === 'gitLog')
    && typeof value.key === 'string';
}
