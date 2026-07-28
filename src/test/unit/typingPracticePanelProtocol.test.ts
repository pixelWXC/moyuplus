import { describe, expect, it } from 'vitest';
import {
  TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
  decodePracticePanelClientMessage,
  wrapPracticeTransactionAck
} from '../../typing/adapters/panel';

describe('typing practice panel protocol', () => {
  it.each([
    {
      type: 'practice/ready',
      sessionId: 'session-1',
      panelInstanceId: 'panel-1',
      sequence: 1
    },
    {
      type: 'practice/submit',
      sessionId: 'session-1',
      panelInstanceId: 'panel-1',
      sequence: 2,
      transactionId: 'transaction-1',
      baseRevision: 0,
      inputKind: 'composition',
      text: '主题'
    },
    {
      type: 'practice/correct',
      sessionId: 'session-1',
      panelInstanceId: 'panel-1',
      sequence: 3,
      transactionId: 'transaction-2',
      baseRevision: 1
    },
    {
      type: 'practice/requestSnapshot',
      sessionId: 'session-1',
      panelInstanceId: 'panel-1',
      sequence: 4
    },
    {
      type: 'practice/pause',
      sessionId: 'session-1',
      panelInstanceId: 'panel-1',
      sequence: 5
    }
  ])('accepts a valid $type message', message => {
    expect(decodePracticePanelClientMessage({
      protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
      ...message
    })).toEqual({
      protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
      ...message
    });
  });

  it.each([
    {},
    { type: 'practice/unknown' },
    validSubmit({ sequence: 0 }),
    validSubmit({ sequence: 1.5 }),
    validSubmit({ transactionId: '' }),
    validSubmit({ baseRevision: -1 }),
    validSubmit({ inputKind: 'candidate' }),
    validSubmit({ panelInstanceId: '' }),
    validSubmit({ sessionId: '' }),
    validSubmit({ protocolVersion: 99 })
  ])('rejects malformed or unknown messages', value => {
    expect(decodePracticePanelClientMessage(value)).toBeUndefined();
  });

  it('wraps a receipt for the current panel envelope and current snapshot', () => {
    const snapshot = {
      sessionId: 'session-1',
      revision: 3,
      status: 'running' as const,
      targetIndex: 2,
      totalUnits: 10,
      window: { start: 0, end: 3, units: [] },
      updatedAt: 10
    };

    expect(wrapPracticeTransactionAck({
      sessionId: 'session-1',
      panelInstanceId: 'panel-new',
      sequence: 7,
      transactionId: 'transaction-old',
      ack: {
        outcome: 'applied',
        transactionRevision: 2,
        currentRevision: 3,
        consumedText: 'a',
        unconsumedText: '',
        snapshot
      }
    })).toEqual({
      protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
      type: 'practice/ack',
      sessionId: 'session-1',
      panelInstanceId: 'panel-new',
      sequence: 7,
      transactionId: 'transaction-old',
      outcome: 'applied',
      transactionRevision: 2,
      currentRevision: 3,
      consumedText: 'a',
      unconsumedText: '',
      snapshot
    });
  });
});

function validSubmit(overrides: Record<string, unknown>) {
  return {
    protocolVersion: TYPING_PRACTICE_PANEL_PROTOCOL_VERSION,
    type: 'practice/submit',
    sessionId: 'session-1',
    panelInstanceId: 'panel-1',
    sequence: 1,
    transactionId: 'transaction-1',
    baseRevision: 0,
    inputKind: 'direct',
    text: 'a',
    ...overrides
  };
}
