import { describe, expect, it } from 'vitest';
import {
  TypingPracticeInputStateMachine,
  createTypingPracticeInputState,
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
