import type { PracticePanelSnapshot } from '../typing/application';
import {
  TYPING_PRACTICE_PANEL_PROTOCOL_VERSION
} from '../typing/adapters/panel/typingPracticePanelProtocol';
import {
  TypingPracticeInputStateMachine,
  createTypingPracticeInputState,
  resolveSmartQuoteInput,
  restoreTypingPracticeInputState,
  type PendingSmartQuoteProbe,
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
let focusPauseRequested = false;
let focusAfterResume = false;
let localActiveElapsedMs = 0;
let localActiveStartedAt: number | undefined;
let domChangeSequence = 0;
let observedValue = '';
let compositionBaseValue = '';
let quoteProbe: PendingSmartQuoteProbe | undefined;
let activeQuoteKey = false;
let trailingClosingSuppression: PendingSmartQuoteProbe['closing'] | undefined;
let nativeLineStartIndex: number | undefined;
let lastEndedCompositionId: string | undefined;
let transactionSequence = 0;
let compositionSequence = 0;
let controlSequence = 1;
const inputGraphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme'
});
const showVirtualKeyboard = document.body.dataset.showVirtualKeyboard !== 'false';

const machine = new TypingPracticeInputStateMachine({
  sessionId,
  nextCompositionId: () => `composition-${++compositionSequence}`,
  nextTransactionId: () => `transaction-${++transactionSequence}-${nextId('input')}`
});

applyAppearance();
const elements = createShell(root);
bindInput();
window.setInterval(renderLiveMetrics, 250);
window.addEventListener('message', event => receive(event.data));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  if (inputState.composition.kind === 'composing') {
    inputState = {
      ...inputState,
      composition: { kind: 'idle' }
    };
    setNativeInputValue(compositionBaseValue);
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
    resetLocalActiveClock();
    transition({
      type: 'snapshot',
      revision: snapshot.revision,
      status: snapshot.status,
      blockedAttemptId: snapshot.blockedAttempt?.attemptId
    });
    reconcileNativeInputContext(snapshot.status === 'blockedOnError');
    restoreFocusAfterResume();
    requestFocusPause();
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
    resetLocalActiveClock();
    transition({
      type: 'ack',
      panelInstanceId: value.panelInstanceId,
      sequence: value.sequence,
      transactionId: value.transactionId,
      outcome: value.outcome,
      currentRevision: value.currentRevision,
      blockedAttemptId: snapshot.blockedAttempt?.attemptId
    });
    reconcileNativeInputContext(value.outcome === 'blocked');
    restoreFocusAfterResume();
    requestFocusPause();
  }
}

function bindInput(): void {
  const input = elements.input;
  input.addEventListener('focus', () => {
    focused = true;
    startLocalActiveClock();
    render();
  });
  input.addEventListener('blur', () => {
    stopLocalActiveClock();
    focused = false;
    render();
    requestFocusPause();
  });
  input.addEventListener('compositionstart', () => {
    compositionBaseValue = input.value;
    transition({ type: 'compositionStart' });
  });
  input.addEventListener('compositionupdate', event => {
    observeInputValue();
    transition({
      type: 'compositionUpdate',
      text: insertedText(compositionBaseValue, input.value, event.data)
    });
  });
  input.addEventListener('compositionend', event => {
    const composition = inputState.composition;
    const compositionId = composition.kind === 'composing'
      ? composition.compositionId
      : undefined;
    const sequence = observeInputValue();
    const text = insertedText(compositionBaseValue, input.value, event.data);
    const canCapture = canCaptureLiveInput();
    const submitText = canCapture
      ? resolveLiveSmartQuote(text)
      : undefined;
    if (!canCapture) {
      setNativeInputValue(compositionBaseValue);
    }
    transition({
      type: 'compositionEnd',
      text: submitText ?? '',
      domChangeSequence: sequence
    });
    lastEndedCompositionId = compositionId;
    compositionBaseValue = input.value;
    render();
  });
  input.addEventListener('input', event => {
    const inputEvent = event as InputEvent;
    const previousValue = observedValue;
    const sequence = observeInputValue();
    if (inputEvent.isComposing || inputState.composition.kind === 'composing') {
      transition({
        type: 'compositionUpdate',
        text: insertedText(compositionBaseValue, input.value, inputEvent.data)
      });
      return;
    }
    const text = insertedText(previousValue, input.value, inputEvent.data);
    if (consumeTrailingAutoClose(text)) {
      lastEndedCompositionId = undefined;
      render();
      return;
    }
    if (lastEndedCompositionId && text.length === 0) {
      transition({
        type: 'directInput',
        text: '',
        compositionId: lastEndedCompositionId,
        domChangeSequence: sequence
      });
      lastEndedCompositionId = undefined;
      return;
    }
    if (!canCaptureLiveInput()) {
      setNativeInputValue(previousValue);
      lastEndedCompositionId = undefined;
      render();
      return;
    }
    const submitText = resolveLiveSmartQuote(text);
    transition({
      type: 'directInput',
      text: submitText ?? '',
      compositionId: lastEndedCompositionId,
      domChangeSequence: sequence
    });
    lastEndedCompositionId = undefined;
    render();
  });
  input.addEventListener('paste', event => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    cancelSmartQuoteProbe();
    if (canCaptureLiveInput()) {
      appendNativeInputText(text);
    }
    transition({ type: 'paste', text });
  });
  input.addEventListener('beforeinput', event => {
    const inputEvent = event as InputEvent;
    if (
      inputEvent.inputType === 'deleteContentBackward'
      && inputState.composition.kind !== 'composing'
    ) {
      event.preventDefault();
      handleBackspace();
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
    if (event.code === 'Quote') {
      trailingClosingSuppression = undefined;
      activeQuoteKey = true;
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      activeQuoteKey = false;
      trailingClosingSuppression = undefined;
    }
    if (
      event.key === 'Backspace'
      && inputState.composition.kind !== 'composing'
    ) {
      event.preventDefault();
      handleBackspace();
      return;
    }
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
  input.addEventListener('keyup', event => {
    if (event.code !== 'Quote') return;
    window.setTimeout(() => {
      activeQuoteKey = false;
      trailingClosingSuppression = undefined;
    }, 0);
  });
  elements.focusPrompt.addEventListener('click', () => {
    if (focusPauseRequested || snapshot?.status === 'paused') {
      focusPauseRequested = false;
      focusAfterResume = true;
      vscode.postMessage({
        protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
        type: 'practice/resume',
        sessionId,
        panelInstanceId,
        sequence: ++controlSequence
      });
      return;
    }
    input.focus();
  });
}

function canCaptureLiveInput(): boolean {
  return !inputState.transport.resyncing
    && (
      inputState.authority.kind === 'ready'
      || (
        inputState.authority.kind === 'blocked'
        && inputState.transport.pending.some(value => value.type === 'correct')
      )
    );
}

function resolveLiveSmartQuote(text: string): string | undefined {
  const previousProbe = quoteProbe;
  const expected = currentExpectedTexts();
  const resolution = resolveSmartQuoteInput(
    expected.current,
    expected.following,
    text,
    previousProbe
  );
  applyNativeQuoteDiscard(resolution.discard, text, previousProbe);
  quoteProbe = resolution.probe;
  trailingClosingSuppression = activeQuoteKey
    ? resolution.suppressTrailingClosing
    : undefined;
  return resolution.submitText;
}

function consumeTrailingAutoClose(text: string): boolean {
  const closing = trailingClosingSuppression;
  trailingClosingSuppression = undefined;
  if (!activeQuoteKey || !closing || text !== closing) return false;
  const value = elements.input.value;
  if (value.endsWith(text)) {
    setNativeInputValue(value.slice(0, -text.length));
  }
  return true;
}

function cancelSmartQuoteProbe(): boolean {
  const probe = quoteProbe;
  if (!probe) return false;
  quoteProbe = undefined;
  const value = elements.input.value;
  if (value.endsWith(probe.opening)) {
    setNativeInputValue(value.slice(0, -probe.opening.length));
  }
  return true;
}

function applyNativeQuoteDiscard(
  discard:
    | 'none'
    | 'previousOpening'
    | 'insertedOpening'
    | 'insertedClosing',
  inserted: string,
  previousProbe: PendingSmartQuoteProbe | undefined
): void {
  if (discard === 'none') return;
  const value = elements.input.value;
  const opening = previousProbe?.opening
    ?? (inserted.startsWith('“') ? '“' : inserted.startsWith('‘') ? '‘' : '');
  const closing = inserted.endsWith('”')
    ? '”'
    : inserted.endsWith('’') ? '’' : '';
  const suffix = discard === 'previousOpening'
    ? `${opening}${inserted}`
    : inserted;
  const replacement = discard === 'previousOpening'
    ? inserted
    : discard === 'insertedOpening'
      ? inserted.slice(opening.length)
      : inserted.slice(0, -closing.length);
  if (value.endsWith(suffix)) {
    setNativeInputValue(value.slice(0, -suffix.length) + replacement);
  }
}

function handleBackspace(): void {
  if (cancelSmartQuoteProbe()) {
    persistAndRender();
    return;
  }
  if (
    inputState.authority.kind === 'blocked'
    && !inputState.transport.pending.some(value => value.type === 'correct')
  ) {
    removeLastNativeGrapheme();
  }
  transition({ type: 'backspace' });
}

function removeLastNativeGrapheme(): void {
  const graphemes = segmentInputGraphemes(elements.input.value);
  graphemes.pop();
  setNativeInputValue(graphemes.join(''));
}

function currentExpectedTexts(): {
  current: string;
  following: string | undefined;
} {
  if (!snapshot) return { current: '', following: undefined };
  let targetIndex = snapshot.targetIndex;
  for (const pending of inputState.transport.pending) {
    if (pending.type !== 'submit') continue;
    targetIndex += segmentInputGraphemes(pending.text).length;
  }
  return {
    current: snapshot.window.units.find(unit => unit.index === targetIndex)?.text
      ?? snapshot.blockedAttempt?.expected
      ?? '',
    following: snapshot.window.units.find(unit =>
      unit.index === targetIndex + 1
    )?.text
  };
}

function reconcileNativeInputContext(force: boolean): void {
  if (!snapshot) return;
  const projected = nativeLineContext(snapshot);
  const lineChanged = nativeLineStartIndex === undefined
    || (
      projected.hasKnownLineBoundary
      && nativeLineStartIndex !== projected.lineStartIndex
    );
  if (!force && nativeLineStartIndex !== undefined && !lineChanged) return;

  quoteProbe = undefined;
  trailingClosingSuppression = undefined;
  const optimisticText = inputState.transport.pending
    .filter(
      (pending): pending is Extract<typeof pending, { type: 'submit' }> =>
        pending.type === 'submit'
    )
    .map(pending => pending.text)
    .join('');
  setNativeInputValue(projected.text + optimisticText);
  compositionBaseValue = elements.input.value;
  nativeLineStartIndex = projected.lineStartIndex;
}

function nativeLineContext(value: PracticePanelSnapshot): {
  lineStartIndex: number;
  hasKnownLineBoundary: boolean;
  text: string;
} {
  const units = value.window.units;
  let anchor = units.findIndex(unit => unit.index === value.targetIndex);
  if (anchor < 0) anchor = units.length;
  let lineStart = anchor;
  while (lineStart > 0 && units[lineStart - 1]?.text !== '\n') {
    lineStart -= 1;
  }
  const text = units
    .slice(lineStart, anchor)
    .filter(unit => unit.state === 'correct')
    .map(unit => unit.text)
    .join('')
    + (value.blockedAttempt?.actual ?? '');
  return {
    lineStartIndex: units[lineStart]?.index ?? value.targetIndex,
    hasKnownLineBoundary: lineStart === 0
      ? value.window.start === 0
      : units[lineStart - 1]?.text === '\n',
    text
  };
}

function appendNativeInputText(text: string): void {
  setNativeInputValue(elements.input.value + text);
}

function setNativeInputValue(value: string): void {
  elements.input.value = value;
  observedValue = value;
  elements.input.setSelectionRange(value.length, value.length);
}

function insertedText(
  previousValue: string,
  currentValue: string,
  eventData: string | null
): string {
  if (currentValue.startsWith(previousValue)) {
    return currentValue.slice(previousValue.length);
  }
  return eventData ?? '';
}

function segmentInputGraphemes(value: string): string[] {
  return Array.from(
    inputGraphemeSegmenter.segment(value),
    segment => segment.segment
  );
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
    elements.input.disabled = true;
    return;
  }
  const model = createTypingPracticePanelRenderModel({
    snapshot,
    input: inputState,
    focused
  });
  elements.metrics.hidden = !snapshot.showMetrics;
  renderLiveMetrics();
  elements.error.textContent = model.errorMessage ?? '';
  elements.error.hidden = !model.errorMessage;
  elements.focusPromptLabel.textContent = model.focusMessage ?? '';
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

function renderLiveMetrics(): void {
  if (!snapshot) return;
  const running = snapshot.status === 'running'
    || snapshot.status === 'blockedOnError';
  const sinceSnapshotMs = running
    ? currentLocalActiveElapsedMs()
    : 0;
  const activeElapsedMs = snapshot.metrics.activeElapsedMs + sinceSnapshotMs;
  const completedPrintable = snapshot.metrics.activeElapsedMs <= 0
    ? 0
    : snapshot.metrics.currentCpm
      * snapshot.metrics.activeElapsedMs / 60_000;
  const currentCpm = activeElapsedMs <= 0
    ? 0
    : completedPrintable / (activeElapsedMs / 60_000);
  elements.currentCpm.textContent = formatMetric(currentCpm);
  elements.accuracy.textContent = `${formatMetric(snapshot.metrics.accuracy)}%`;
  elements.duration.textContent = formatDuration(activeElapsedMs);
  elements.remaining.textContent = snapshot.metrics.remaining.kind === 'time'
    ? formatDuration(Math.max(
      0,
      snapshot.metrics.remaining.remainingMs - sinceSnapshotMs
    ), true)
    : `${snapshot.metrics.remaining.remainingUnits} 单元`;
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
      <dl class="practice-metrics" aria-label="局内实时数据">
        <div>
          <dt>当前速度</dt>
          <dd><span class="practice-current-cpm">0</span> <small>CPM</small></dd>
        </div>
        <div>
          <dt>准确率</dt>
          <dd class="practice-accuracy">100%</dd>
        </div>
        <div>
          <dt>练习时长</dt>
          <dd class="practice-duration">00:00</dd>
        </div>
        <div>
          <dt>目标剩余</dt>
          <dd class="practice-remaining">—</dd>
        </div>
      </dl>
      <section class="practice-stage" aria-label="打字练习">
        <div class="practice-copy">
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
          <button class="practice-focus-prompt" type="button" hidden>
            <span class="practice-focus-prompt-label"></span>
          </button>
        </div>
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
    metrics: requiredSelector<HTMLElement>('.practice-metrics'),
    currentCpm: requiredSelector<HTMLElement>('.practice-current-cpm'),
    accuracy: requiredSelector<HTMLElement>('.practice-accuracy'),
    duration: requiredSelector<HTMLElement>('.practice-duration'),
    remaining: requiredSelector<HTMLElement>('.practice-remaining'),
    stage: requiredSelector<HTMLElement>('.practice-stage'),
    reference: requiredSelector<HTMLElement>('.practice-reference-line'),
    typed: requiredSelector<HTMLElement>('.practice-typed-line'),
    input: requiredSelector<HTMLInputElement>('.practice-input'),
    error: requiredSelector<HTMLElement>('.practice-error-message'),
    focusPrompt: requiredSelector<HTMLButtonElement>('.practice-focus-prompt'),
    focusPromptLabel: requiredSelector<HTMLElement>(
      '.practice-focus-prompt-label'
    ),
    keyboard: requiredSelector<HTMLElement>('.virtual-keyboard'),
    keyboardHint: requiredSelector<HTMLElement>('.keyboard-hint'),
    keys: Array.from(root.querySelectorAll<HTMLElement>('.keyboard-key'))
  };
}

function requestFocusPause(): void {
  if (
    focused
    || focusPauseRequested
    || !snapshot
    || (snapshot.status !== 'running' && snapshot.status !== 'blockedOnError')
  ) {
    return;
  }
  focusPauseRequested = true;
  vscode.postMessage({
    protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
    type: 'practice/pause',
    sessionId,
    panelInstanceId,
    sequence: ++controlSequence
  });
}

function restoreFocusAfterResume(): void {
  if (
    !focusAfterResume
    || !snapshot
    || (snapshot.status !== 'ready'
      && snapshot.status !== 'running'
      && snapshot.status !== 'blockedOnError')
  ) {
    return;
  }
  focusAfterResume = false;
  elements.input.focus();
}

function resetLocalActiveClock(): void {
  localActiveElapsedMs = 0;
  localActiveStartedAt = undefined;
  startLocalActiveClock();
}

function startLocalActiveClock(): void {
  if (
    !focused
    || !snapshot
    || (snapshot.status !== 'running' && snapshot.status !== 'blockedOnError')
    || localActiveStartedAt !== undefined
  ) {
    return;
  }
  localActiveStartedAt = performance.now();
}

function stopLocalActiveClock(): void {
  if (localActiveStartedAt === undefined) return;
  localActiveElapsedMs += Math.max(0, performance.now() - localActiveStartedAt);
  localActiveStartedAt = undefined;
}

function currentLocalActiveElapsedMs(): number {
  return localActiveElapsedMs + (
    localActiveStartedAt === undefined
      ? 0
      : Math.max(0, performance.now() - localActiveStartedAt)
  );
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
  root.classList.add('color-keyboard-hands');
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
    && typeof value.showMetrics === 'boolean'
    && isRecord(value.metrics)
    && typeof value.metrics.activeElapsedMs === 'number'
    && typeof value.metrics.currentCpm === 'number'
    && typeof value.metrics.accuracy === 'number'
    && isRecord(value.metrics.remaining)
    && (
      (
        value.metrics.remaining.kind === 'time'
        && typeof value.metrics.remaining.remainingMs === 'number'
        && typeof value.metrics.remaining.totalMs === 'number'
      )
      || (
        value.metrics.remaining.kind === 'units'
        && typeof value.metrics.remaining.remainingUnits === 'number'
      )
    )
    && isRecord(value.window)
    && Array.isArray(value.window.units);
}

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
}

function formatDuration(milliseconds: number, roundUp = false): string {
  const totalSeconds = Math.max(
    0,
    (roundUp ? Math.ceil : Math.floor)(milliseconds / 1_000)
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
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
