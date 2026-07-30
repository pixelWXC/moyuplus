import { describe, expect, it } from 'vitest';
import {
  TypingPracticeInputStateMachine,
  createTypingPracticeInputState,
  resolveSmartQuoteInput,
  restoreTypingPracticeInputState
} from '../../webview/typingPracticeInputState';

describe('TypingPracticeInputStateMachine', () => {
  it('does not capture input while loading or resyncing', () => {
    const machine = createMachine();
    const loading = createTypingPracticeInputState('panel-1');

    const ignored = machine.dispatch(loading, {
      type: 'directInput',
      text: 'a',
      domChangeSequence: 1
    });
    const ready = machine.dispatch(loading, {
      type: 'snapshot',
      revision: 0,
      status: 'running'
    }).state;
    const resyncing = {
      ...ready,
      transport: { ...ready.transport, resyncing: true }
    };

    expect(ignored).toEqual({ state: loading, effects: [] });
    expect(machine.dispatch(resyncing, {
      type: 'directInput',
      text: 'a',
      domChangeSequence: 2
    })).toEqual({ state: resyncing, effects: [] });
  });

  it('keeps composition draft local and submits the final value once', () => {
    const machine = createMachine();
    let state = readyState(machine);

    state = machine.dispatch(state, { type: 'compositionStart' }).state;
    state = machine.dispatch(state, {
      type: 'compositionUpdate',
      text: 'zhu'
    }).state;
    expect(state.composition).toMatchObject({
      kind: 'composing',
      draftText: 'zhu'
    });
    expect(state.transport.pending).toEqual([]);

    const ended = machine.dispatch(state, {
      type: 'compositionEnd',
      text: '主',
      domChangeSequence: 4
    });
    expect(ended.effects).toEqual([{
      type: 'postMessage',
      message: expect.objectContaining({
        type: 'practice/submit',
        transactionId: 'transaction-1',
        inputKind: 'composition',
        text: '主',
        baseRevision: 0,
        sequence: 1
      })
    }]);

    const trailing = machine.dispatch(ended.state, {
      type: 'directInput',
      text: '主',
      compositionId: 'composition-1',
      domChangeSequence: 4
    });
    expect(trailing.effects).toEqual([]);
    expect(trailing.state.transport.pending).toHaveLength(1);
  });

  it('queues rapid direct input and binds base revision only when each head is sent', () => {
    const machine = createMachine();
    let state = readyState(machine);
    const first = machine.dispatch(state, {
      type: 'directInput',
      text: 'a',
      domChangeSequence: 1
    });
    state = first.state;
    const second = machine.dispatch(state, {
      type: 'directInput',
      text: 'b',
      domChangeSequence: 2
    });
    state = second.state;

    expect(first.effects[0]).toMatchObject({
      message: { baseRevision: 0, sequence: 1, text: 'a' }
    });
    expect(second.effects).toEqual([]);
    expect(state.transport.pending[1]?.envelope).toBeUndefined();

    const acked = machine.dispatch(state, {
      type: 'ack',
      panelInstanceId: 'panel-1',
      sequence: 1,
      transactionId: 'transaction-1',
      outcome: 'applied',
      currentRevision: 1
    });
    expect(acked.effects[0]).toMatchObject({
      message: {
        transactionId: 'transaction-2',
        baseRevision: 1,
        sequence: 2,
        text: 'b'
      }
    });
  });

  it('clears unsent submits on blocked ack and discards an active composition on end', () => {
    const machine = createMachine();
    let state = readyState(machine);
    state = machine.dispatch(state, {
      type: 'directInput',
      text: 'X',
      domChangeSequence: 1
    }).state;
    state = machine.dispatch(state, {
      type: 'directInput',
      text: 'future',
      domChangeSequence: 2
    }).state;
    state = machine.dispatch(state, { type: 'compositionStart' }).state;

    const blocked = machine.dispatch(state, {
      type: 'ack',
      panelInstanceId: 'panel-1',
      sequence: 1,
      transactionId: 'transaction-1',
      outcome: 'blocked',
      currentRevision: 1,
      blockedAttemptId: 'input-1'
    });

    expect(blocked.state.transport.pending).toEqual([]);
    expect(blocked.state.composition).toMatchObject({
      kind: 'composing',
      discardOnEnd: true
    });
    const discarded = machine.dispatch(blocked.state, {
      type: 'compositionEnd',
      text: '候选',
      domChangeSequence: 3
    });
    expect(discarded.effects).toEqual([]);
    expect(discarded.state.composition).toEqual({ kind: 'idle' });
  });

  it('deduplicates correction while in flight and rejects input after completion', () => {
    const machine = createMachine();
    let state = machine.dispatch(createTypingPracticeInputState('panel-1'), {
      type: 'snapshot',
      revision: 1,
      status: 'blockedOnError',
      blockedAttemptId: 'input-1'
    }).state;
    const first = machine.dispatch(state, { type: 'backspace' });
    state = first.state;
    const repeated = machine.dispatch(state, { type: 'backspace' });

    expect(first.effects).toHaveLength(1);
    expect(repeated.effects).toEqual([]);
    expect(repeated.state.transport.pending).toHaveLength(1);

    const completed = machine.dispatch(state, {
      type: 'ack',
      panelInstanceId: 'panel-1',
      sequence: 1,
      transactionId: 'transaction-1',
      outcome: 'completed',
      currentRevision: 2
    }).state;
    expect(completed.transport.pending).toEqual([]);
    expect(machine.dispatch(completed, {
      type: 'directInput',
      text: 'late',
      domChangeSequence: 2
    }).effects).toEqual([]);
  });

  it('queues replacement input typed while a blocked correction is in flight', () => {
    const machine = createMachine();
    let state = machine.dispatch(createTypingPracticeInputState('panel-1'), {
      type: 'snapshot',
      revision: 1,
      status: 'blockedOnError',
      blockedAttemptId: 'input-1'
    }).state;

    const correction = machine.dispatch(state, { type: 'backspace' });
    state = correction.state;
    const replacement = machine.dispatch(state, {
      type: 'directInput',
      text: '”',
      domChangeSequence: 2
    });
    state = replacement.state;

    expect(correction.effects[0]).toMatchObject({
      message: {
        type: 'practice/correct',
        baseRevision: 1,
        sequence: 1
      }
    });
    expect(replacement.effects).toEqual([]);
    expect(state.transport.pending).toMatchObject([
      { type: 'correct', transactionId: 'transaction-1' },
      { type: 'submit', transactionId: 'transaction-2', text: '”' }
    ]);

    const corrected = machine.dispatch(state, {
      type: 'ack',
      panelInstanceId: 'panel-1',
      sequence: 1,
      transactionId: 'transaction-1',
      outcome: 'applied',
      currentRevision: 2
    });

    expect(corrected.effects[0]).toMatchObject({
      message: {
        type: 'practice/submit',
        text: '”',
        baseRevision: 2,
        sequence: 2
      }
    });
  });

  it('restores transaction ids for a new panel but rebuilds envelopes and sequence', () => {
    const machine = createMachine();
    const sent = machine.dispatch(readyState(machine), {
      type: 'directInput',
      text: 'a',
      domChangeSequence: 1
    }).state;

    const restored = restoreTypingPracticeInputState(sent, 'panel-2');

    expect(restored.panelInstanceId).toBe('panel-2');
    expect(restored.transport.nextSequence).toBe(1);
    expect(restored.transport.pending[0]).toMatchObject({
      transactionId: 'transaction-1',
      envelope: undefined
    });
    expect(restored.authority).toEqual({ kind: 'loading' });
  });
});

describe('resolveSmartQuoteInput', () => {
  it('holds an opening probe until the matching closing quote arrives', () => {
    const opening = resolveSmartQuoteInput('”', '云', '“');

    expect(opening).toEqual({
      probe: { opening: '“', closing: '”' },
      discard: 'none'
    });
    expect(resolveSmartQuoteInput('”', '云', '”', opening.probe)).toEqual({
      submitText: '”',
      discard: 'previousOpening',
      suppressTrailingClosing: '”'
    });
  });

  it('accepts an IME-inserted quote pair as one closing quote', () => {
    expect(resolveSmartQuoteInput('’', '云', '‘’')).toEqual({
      submitText: '’',
      discard: 'insertedOpening',
      suppressTrailingClosing: '’'
    });
  });

  it('drops an auto-closing quote unless it is also the next target', () => {
    expect(resolveSmartQuoteInput('“', '云', '“”')).toEqual({
      submitText: '“',
      discard: 'insertedClosing'
    });
    expect(resolveSmartQuoteInput('“', '”', '“”')).toEqual({
      submitText: '“”',
      discard: 'none'
    });
  });

  it('arms trailing-close suppression for split IME pair events', () => {
    expect(resolveSmartQuoteInput('“', '云', '“')).toEqual({
      submitText: '“',
      discard: 'none',
      suppressTrailingClosing: '”'
    });
    expect(resolveSmartQuoteInput('“', '”', '“')).toEqual({
      submitText: '“',
      discard: 'none'
    });
  });

  it('does not reinterpret an opening target or unrelated input', () => {
    expect(resolveSmartQuoteInput('“', '云', 'X')).toEqual({
      submitText: 'X',
      discard: 'none'
    });
    expect(resolveSmartQuoteInput('云', undefined, '云')).toEqual({
      submitText: '云',
      discard: 'none'
    });
  });

  it('does not probe an exact closing target', () => {
    expect(resolveSmartQuoteInput('”', '云', '”')).toEqual({
      submitText: '”',
      discard: 'none',
      suppressTrailingClosing: '”'
    });
  });

  it('keeps opening and unrelated targets authoritative', () => {
    expect(resolveSmartQuoteInput('“', '云', '“')).toEqual({
      submitText: '“',
      discard: 'none',
      suppressTrailingClosing: '”'
    });
    expect(resolveSmartQuoteInput('”', '云', 'X')).toEqual({
      submitText: 'X',
      discard: 'none'
    });
  });

  it('discards a stale probe but preserves the newly typed text', () => {
    expect(resolveSmartQuoteInput(
      '云',
      undefined,
      '云',
      { opening: '“', closing: '”' }
    )).toEqual({
      submitText: '云',
      discard: 'previousOpening'
    });
  });
});

function createMachine() {
  let composition = 0;
  let transaction = 0;
  return new TypingPracticeInputStateMachine({
    sessionId: 'session-1',
    nextCompositionId: () => `composition-${++composition}`,
    nextTransactionId: () => `transaction-${++transaction}`
  });
}

function readyState(machine: TypingPracticeInputStateMachine) {
  return machine.dispatch(createTypingPracticeInputState('panel-1'), {
    type: 'snapshot',
    revision: 0,
    status: 'running'
  }).state;
}
