import type { PracticePanelSnapshot } from '../typing/application';
import {
  TYPING_PRACTICE_PANEL_PROTOCOL_VERSION
} from '../typing/adapters/panel/typingPracticePanelProtocol';
import {
  TypingPracticeInputStateMachine,
  createTypingPracticeInputState,
  restoreTypingPracticeInputState,
  type TypingPracticeInputEffect,
  type TypingPracticeInputState
} from './typingPracticeInputState';
import {
  createTypingPracticePanelRenderModel
} from './typingPracticePanelRender';
import './typingPracticePanelStyles.css';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): { input?: TypingPracticeInputState } | undefined;
  setState(value: { input: TypingPracticeInputState }): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const root = requiredElement('app');
const sessionId = document.body.dataset.sessionId ?? '';
const panelInstanceId = nextId('panel');
const restored = vscode.getState()?.input;
let inputState = restored
  ? restoreTypingPracticeInputState(restored, panelInstanceId)
  : createTypingPracticeInputState(panelInstanceId);
let snapshot: PracticePanelSnapshot | undefined;
let focused = false;
let domChangeSequence = 0;
let observedValue = '';
let lastEndedCompositionId: string | undefined;
let transactionSequence = 0;
let compositionSequence = 0;
const showVirtualKeyboard = document.body.dataset.showVirtualKeyboard !== 'false';

const machine = new TypingPracticeInputStateMachine({
  sessionId,
  nextCompositionId: () => `composition-${++compositionSequence}`,
  nextTransactionId: () => `transaction-${++transactionSequence}-${nextId('input')}`
});

applyAppearance();
const elements = createShell(root);
bindInput();
window.addEventListener('message', event => receive(event.data));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  if (inputState.composition.kind === 'composing') {
    inputState = {
      ...inputState,
      composition: { kind: 'idle' }
    };
    elements.input.value = '';
    observedValue = '';
    persistAndRender();
  }
});

vscode.postMessage({
  protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
  type: 'practice/ready',
  sessionId,
  panelInstanceId,
  sequence: 1
});
render();

function receive(value: unknown): void {
  if (!isRecord(value) || value.protocolVersion !== 1) return;
  if (value.type === 'practice/snapshot' && isSnapshot(value.snapshot)) {
    snapshot = value.snapshot;
    transition({
      type: 'snapshot',
      revision: snapshot.revision,
      status: snapshot.status,
      blockedAttemptId: snapshot.blockedAttempt?.attemptId
    });
    return;
  }
  if (
    value.type === 'practice/ack'
    && isSnapshot(value.snapshot)
    && typeof value.panelInstanceId === 'string'
    && typeof value.sequence === 'number'
    && typeof value.transactionId === 'string'
    && isAckOutcome(value.outcome)
    && typeof value.currentRevision === 'number'
  ) {
    snapshot = value.snapshot;
    transition({
      type: 'ack',
      panelInstanceId: value.panelInstanceId,
      sequence: value.sequence,
      transactionId: value.transactionId,
      outcome: value.outcome,
      currentRevision: value.currentRevision,
      blockedAttemptId: snapshot.blockedAttempt?.attemptId
    });
  }
}

function bindInput(): void {
  const input = elements.input;
  input.addEventListener('focus', () => {
    focused = true;
    render();
  });
  input.addEventListener('blur', () => {
    focused = false;
    render();
  });
  input.addEventListener('compositionstart', () => {
    transition({ type: 'compositionStart' });
  });
  input.addEventListener('compositionupdate', event => {
    observeInputValue();
    transition({
      type: 'compositionUpdate',
      text: input.value || event.data || ''
    });
  });
  input.addEventListener('compositionend', event => {
    const composition = inputState.composition;
    const compositionId = composition.kind === 'composing'
      ? composition.compositionId
      : undefined;
    const sequence = observeInputValue();
    transition({
      type: 'compositionEnd',
      text: input.value || event.data || '',
      domChangeSequence: sequence
    });
    lastEndedCompositionId = compositionId;
    input.value = '';
    observedValue = '';
    render();
  });
  input.addEventListener('input', event => {
    const inputEvent = event as InputEvent;
    const sequence = observeInputValue();
    if (inputEvent.isComposing || inputState.composition.kind === 'composing') {
      transition({ type: 'compositionUpdate', text: input.value });
      return;
    }
    transition({
      type: 'directInput',
      text: input.value,
      compositionId: lastEndedCompositionId,
      domChangeSequence: sequence
    });
    lastEndedCompositionId = undefined;
    input.value = '';
    observedValue = '';
    render();
  });
  input.addEventListener('paste', event => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    transition({ type: 'paste', text });
    input.value = '';
    observedValue = '';
  });
  input.addEventListener('beforeinput', event => {
    const inputEvent = event as InputEvent;
    if (
      inputEvent.inputType === 'deleteContentBackward'
      && inputState.composition.kind !== 'composing'
    ) {
      event.preventDefault();
      transition({ type: 'backspace' });
      return;
    }
    if (
      inputEvent.inputType === 'historyUndo'
      || inputEvent.inputType === 'historyRedo'
      || inputEvent.inputType === 'deleteContentForward'
    ) {
      event.preventDefault();
    }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key === 'F6' || event.key === 'Escape') {
      return;
    }
    if (
      event.key === 'ArrowLeft'
      || event.key === 'ArrowRight'
      || event.key === 'ArrowUp'
      || event.key === 'ArrowDown'
      || event.key === 'Home'
      || event.key === 'End'
      || event.key === 'Enter'
      || ((event.ctrlKey || event.metaKey) && ['a', 'x', 'z', 'y'].includes(
        event.key.toLocaleLowerCase()
      ))
    ) {
      event.preventDefault();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  elements.focusPrompt.addEventListener('click', () => input.focus());
}

function transition(action: Parameters<typeof machine.dispatch>[1]): void {
  const result = machine.dispatch(inputState, action);
  inputState = result.state;
  applyEffects(result.effects);
  persistAndRender();
}

function applyEffects(effects: TypingPracticeInputEffect[]): void {
  for (const effect of effects) {
    vscode.postMessage(effect.message);
  }
}

function persistAndRender(): void {
  vscode.setState({ input: inputState });
  render();
}

function render(): void {
  if (!snapshot) {
    elements.status.textContent = '正在恢复练习…';
    elements.input.disabled = true;
    return;
  }
  const model = createTypingPracticePanelRenderModel({
    snapshot,
    input: inputState,
    focused
  });
  elements.status.textContent = snapshot.status === 'completed'
    ? '练习完成'
    : inputState.transport.resyncing
      ? '正在同步进度…'
      : '练习进行中';
  elements.progress.textContent = model.progressLabel;
  elements.error.textContent = model.errorMessage ?? '';
  elements.error.hidden = !model.errorMessage;
  elements.focusPrompt.textContent = model.focusMessage ?? '';
  elements.focusPrompt.hidden = !model.focusMessage;
  elements.input.disabled = inputState.authority.kind === 'loading'
    || inputState.transport.resyncing
    || inputState.authority.kind === 'completed'
    || inputState.authority.kind === 'paused'
    || inputState.authority.kind === 'error';
  elements.input.classList.toggle(
    'practice-unit--composition',
    inputState.composition.kind === 'composing'
  );
  elements.stage.classList.toggle('is-focused', focused);
  renderSegments(elements.reference, model.referenceSegments);
  renderSegments(elements.typed, model.inputSegments);
  renderKeyboard(model.keyboardTarget);
}

function renderSegments(
  container: HTMLElement,
  segments: ReturnType<
    typeof createTypingPracticePanelRenderModel
  >['referenceSegments']
): void {
  container.replaceChildren();
  for (const segment of segments) {
    container.append(span(segment));
  }
}

function renderKeyboard(
  target: ReturnType<
    typeof createTypingPracticePanelRenderModel
  >['keyboardTarget']
): void {
  elements.keyboard.hidden = !showVirtualKeyboard;
  if (!showVirtualKeyboard) return;
  elements.keyboardHint.textContent = target.hint;
  for (const key of elements.keys) {
    const active = key.dataset.code === target.code
      || key.dataset.code === target.shiftCode;
    key.classList.toggle('is-next', active);
    key.setAttribute('aria-current', active ? 'true' : 'false');
  }
}

function span(segment: { text: string; className: string }): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = segment.className;
  element.textContent = segment.text;
  return element;
}

function createShell(container: HTMLElement) {
  container.innerHTML = `
    <main class="practice-panel">
      <header class="practice-header">
        <div>
          <p class="practice-eyebrow">FOCUS MODE</p>
          <p class="practice-status" role="status"></p>
        </div>
        <div class="practice-header-meta">
          <p class="practice-progress" aria-label="练习进度"></p>
          <p class="practice-style-note">外观可在打字练习设置中调整</p>
        </div>
      </header>
      <section class="practice-stage" aria-label="打字练习">
        <div class="practice-track practice-track--reference">
          <span class="practice-track-label">对照</span>
          <div class="practice-line practice-reference-line"></div>
        </div>
        <div class="practice-track practice-track--input">
          <span class="practice-track-label">输入</span>
          <div class="practice-line practice-typed-line"></div>
          <input
              class="practice-input"
              type="text"
              aria-label="练习输入"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
            >
        </div>
        <p class="practice-error-message" role="alert" hidden></p>
        <button class="practice-focus-prompt" type="button" hidden></button>
        <section class="virtual-keyboard" aria-label="虚拟键盘">
          <div class="keyboard-heading">
            <span>键位提示</span>
            <span class="keyboard-hint" role="status"></span>
          </div>
          <div class="keyboard-board">
            ${keyboardHtml()}
          </div>
          <div class="keyboard-legend" aria-hidden="true">
            <span><i class="legend-swatch legend-swatch--left"></i>左手区域</span>
            <span><i class="legend-swatch legend-swatch--right"></i>右手区域</span>
          </div>
        </section>
      </section>
      <p class="practice-announcement" aria-live="polite"></p>
    </main>
  `;
  return {
    status: requiredSelector<HTMLElement>('.practice-status'),
    progress: requiredSelector<HTMLElement>('.practice-progress'),
    stage: requiredSelector<HTMLElement>('.practice-stage'),
    reference: requiredSelector<HTMLElement>('.practice-reference-line'),
    typed: requiredSelector<HTMLElement>('.practice-typed-line'),
    input: requiredSelector<HTMLInputElement>('.practice-input'),
    error: requiredSelector<HTMLElement>('.practice-error-message'),
    focusPrompt: requiredSelector<HTMLButtonElement>('.practice-focus-prompt'),
    keyboard: requiredSelector<HTMLElement>('.virtual-keyboard'),
    keyboardHint: requiredSelector<HTMLElement>('.keyboard-hint'),
    keys: Array.from(root.querySelectorAll<HTMLElement>('.keyboard-key'))
  };
}

function keyboardRows() {
  return [
    [
    key('Backquote', '`', 'left'), key('Digit1', '1', 'left'),
    key('Digit2', '2', 'left'), key('Digit3', '3', 'left'),
    key('Digit4', '4', 'left'), key('Digit5', '5', 'left'),
    key('Digit6', '6', 'right'), key('Digit7', '7', 'right'),
    key('Digit8', '8', 'right'), key('Digit9', '9', 'right'),
    key('Digit0', '0', 'right'), key('Minus', '-', 'right'),
    key('Equal', '=', 'right'), key('Backspace', '⌫', 'right', 'wide')
  ],
  [
    key('Tab', 'Tab', 'left', 'wide'), key('KeyQ', 'Q', 'left'),
    key('KeyW', 'W', 'left'), key('KeyE', 'E', 'left'),
    key('KeyR', 'R', 'left'), key('KeyT', 'T', 'left'),
    key('KeyY', 'Y', 'right'), key('KeyU', 'U', 'right'),
    key('KeyI', 'I', 'right'), key('KeyO', 'O', 'right'),
    key('KeyP', 'P', 'right'), key('BracketLeft', '[', 'right'),
    key('BracketRight', ']', 'right'), key('Backslash', '\\', 'right')
  ],
  [
    key('CapsLock', 'Caps', 'left', 'wide'), key('KeyA', 'A', 'left'),
    key('KeyS', 'S', 'left'), key('KeyD', 'D', 'left'),
    key('KeyF', 'F', 'left'), key('KeyG', 'G', 'left'),
    key('KeyH', 'H', 'right'), key('KeyJ', 'J', 'right'),
    key('KeyK', 'K', 'right'), key('KeyL', 'L', 'right'),
    key('Semicolon', ';', 'right'), key('Quote', '\'', 'right'),
    key('Enter', 'Enter', 'right', 'wide')
  ],
  [
    key('ShiftLeft', 'Shift', 'left', 'shift'), key('KeyZ', 'Z', 'left'),
    key('KeyX', 'X', 'left'), key('KeyC', 'C', 'left'),
    key('KeyV', 'V', 'left'), key('KeyB', 'B', 'left'),
    key('KeyN', 'N', 'right'), key('KeyM', 'M', 'right'),
    key('Comma', ',', 'right'), key('Period', '.', 'right'),
    key('Slash', '/', 'right'), key('ShiftRight', 'Shift', 'right', 'shift')
  ],
  [
    key('Space', 'Space', 'both', 'space')
    ]
  ] as const;
}

function key(
  code: string,
  label: string,
  hand: 'left' | 'right' | 'both',
  size: 'normal' | 'wide' | 'shift' | 'space' = 'normal'
) {
  return { code, label, hand, size };
}

function keyboardHtml(): string {
  return keyboardRows().map(row => `
    <div class="keyboard-row">
      ${row.map(value => `
        <span
          class="keyboard-key keyboard-key--${value.hand} keyboard-key--${value.size}"
          data-code="${value.code}"
          aria-current="false"
        >${value.label}</span>`
      ).join('')}
    </div>`
  ).join('');
}

function applyAppearance(): void {
  const fontSize = Number(document.body.dataset.practiceFontSize ?? 34);
  const lineHeight = Number(document.body.dataset.practiceLineHeight ?? 1.6);
  root.style.setProperty(
    '--practice-font-size',
    `${Number.isFinite(fontSize) ? fontSize : 34}px`
  );
  root.style.setProperty(
    '--practice-line-height',
    String(Number.isFinite(lineHeight) ? lineHeight : 1.6)
  );
  root.style.setProperty(
    '--practice-font-family',
    document.body.dataset.practiceFontFamily === 'interface'
      ? 'var(--vscode-font-family)'
      : 'var(--vscode-editor-font-family)'
  );
  root.classList.toggle(
    'color-keyboard-hands',
    document.body.dataset.colorKeyboardHands !== 'false'
  );
}

function observeInputValue(): number {
  if (elements.input.value !== observedValue) {
    observedValue = elements.input.value;
    domChangeSequence += 1;
  }
  return domChangeSequence;
}

function nextId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}.`);
  return element;
}

function requiredSelector<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}.`);
  return element;
}

function isSnapshot(value: unknown): value is PracticePanelSnapshot {
  return isRecord(value)
    && typeof value.sessionId === 'string'
    && typeof value.revision === 'number'
    && typeof value.status === 'string'
    && typeof value.targetIndex === 'number'
    && typeof value.totalUnits === 'number'
    && isRecord(value.window)
    && Array.isArray(value.window.units);
}

function isAckOutcome(
  value: unknown
): value is 'applied' | 'blocked' | 'stale' | 'completed' {
  return value === 'applied'
    || value === 'blocked'
    || value === 'stale'
    || value === 'completed';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
