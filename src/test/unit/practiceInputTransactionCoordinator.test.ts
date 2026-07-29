import { describe, expect, it, vi } from 'vitest';
import {
  PracticeInputTransactionCoordinator,
  PracticeSessionEngine,
  PracticeTransactionEngine,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent
} from '../../typing';

describe('PracticeInputTransactionCoordinator', () => {
  it('persists the delta before replacing authority and returns the current snapshot', async () => {
    const harness = createHarness();

    const ack = await harness.coordinator.submit({
      sessionId: harness.session.id,
      transactionId: 'transaction-1',
      baseRevision: 0,
      kind: 'direct',
      text: 'a'
    });

    expect(harness.order).toEqual(['journal:1', 'replace:1']);
    expect(ack).toMatchObject({
      outcome: 'applied',
      transactionRevision: 1,
      currentRevision: 1,
      consumedText: 'a',
      unconsumedText: '',
      snapshot: {
        sessionId: harness.session.id,
        revision: 1,
        targetIndex: 1
      }
    });
  });

  it('does not mutate authority or complete a result when journal persistence fails', async () => {
    const harness = createHarness();
    harness.append.mockRejectedValueOnce(new Error('journal unavailable'));

    await expect(harness.coordinator.submit({
      sessionId: harness.session.id,
      transactionId: 'transaction-1',
      baseRevision: 0,
      kind: 'direct',
      text: 'a'
    })).rejects.toThrow('journal unavailable');

    expect(harness.current.revision).toBe(0);
    expect(harness.replace).not.toHaveBeenCalled();
    expect(harness.complete).not.toHaveBeenCalled();
  });

  it('returns duplicates without recalculating and returns stale without consuming', async () => {
    const engine = new PracticeTransactionEngine();
    const calculate = vi.spyOn(engine, 'calculate');
    const harness = createHarness(engine);
    const command = {
      sessionId: harness.session.id,
      transactionId: 'transaction-1',
      baseRevision: 0,
      kind: 'direct' as const,
      text: 'a'
    };

    await harness.coordinator.submit(command);
    const duplicate = await harness.coordinator.submit(command);
    const stale = await harness.coordinator.submit({
      ...command,
      transactionId: 'transaction-2'
    });

    expect(calculate).toHaveBeenCalledTimes(1);
    expect(duplicate).toMatchObject({
      outcome: 'applied',
      transactionRevision: 1,
      currentRevision: 1
    });
    expect(stale).toMatchObject({
      outcome: 'stale',
      currentRevision: 1
    });
    expect(harness.current.targetIndex).toBe(1);
  });

  it('serializes competing final and late input and completes once', async () => {
    const harness = createHarness();

    const [completed, late] = await Promise.all([
      harness.coordinator.submit({
        sessionId: harness.session.id,
        transactionId: 'complete',
        baseRevision: 0,
        kind: 'direct',
        text: 'ab'
      }),
      harness.coordinator.submit({
        sessionId: harness.session.id,
        transactionId: 'late',
        baseRevision: 0,
        kind: 'direct',
        text: 'x'
      })
    ]);

    expect(completed.outcome).toBe('completed');
    expect(late.outcome).toBe('stale');
    expect(harness.complete).toHaveBeenCalledTimes(1);
  });

  it('rejects input at the timed boundary and invokes authoritative timeout', async () => {
    const harness = createHarness(new PracticeTransactionEngine(), {
      completion: { kind: 'timed', seconds: 1 },
      monotonicNow: 1_001
    });

    const ack = await harness.coordinator.submit({
      sessionId: harness.session.id,
      transactionId: 'after-timeout',
      baseRevision: 0,
      kind: 'direct',
      text: 'a'
    });

    expect(harness.timeout).toHaveBeenCalledWith(harness.session.id);
    expect(ack.outcome).toBe('completed');
    expect(ack.consumedText).toBe('');
    expect(harness.append).not.toHaveBeenCalled();
  });
});

function createHarness(
  engine = new PracticeTransactionEngine(),
  options: {
    completion?: { kind: 'timed'; seconds: number };
    monotonicNow?: number;
  } = {}
) {
  const contentProfile = { kind: 'english', category: 'adHoc' } as const;
  const snapshot = buildPracticeSnapshot({
    id: 'snapshot-coordinator',
    createdAt: 1,
    plan: createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text: 'ab' },
      contentProfile,
      ...(options.completion ? { completion: options.completion } : {})
    }),
    prepared: preparePracticeContent('ab', {
      sourceRevision: 'source-1',
      contentProfile,
      range: { kind: 'whole' }
    })
  });
  const session = new PracticeSessionEngine().start({
    sessionId: 'session-coordinator',
    attemptId: 'attempt-coordinator',
    snapshot,
    wallTime: 1,
    monotonicTime: 1
  });
  let current = session;
  let attempt = 0;
  const order: string[] = [];
  const append = vi.fn(async (_sessionId: string, delta: { revision: number }) => {
    order.push(`journal:${delta.revision}`);
    return 'appended' as const;
  });
  const replace = vi.fn(async (next: typeof session) => {
    order.push(`replace:${next.revision}`);
    current = next;
  });
  const complete = vi.fn(async () => undefined);
  const timeout = vi.fn(async () => {
    current = {
      ...current,
      status: 'completed',
      endedAt: 2,
      updatedAt: 2
    };
  });
  const coordinator = new PracticeInputTransactionCoordinator({
    authority: {
      get: async () => current,
      replace
    },
    snapshots: {
      get: async () => snapshot
    },
    journal: {
      append,
      recover: async () => [],
      findReceipt: async (_sessionId, transactionId) =>
        current.transactionReceipts[transactionId]
    },
    engine,
    clock: {
      wallNow: () => 2,
      monotonicNow: () => options.monotonicNow ?? 1
    },
    nextAttemptId: () => `input-${++attempt}`,
    timeout,
    complete
  });
  return {
    coordinator,
    session,
    get current() {
      return current;
    },
    order,
    append,
    replace,
    timeout,
    complete
  };
}
