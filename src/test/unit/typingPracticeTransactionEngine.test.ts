import { describe, expect, it } from 'vitest';
import {
  PracticeSessionEngine,
  PracticeTransactionEngine,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type PracticePlan
} from '../../typing';

describe('PracticeTransactionEngine', () => {
  it('computes one revisioned delta without mutating the authoritative session', () => {
    const snapshot = createSnapshot('abc');
    const session = start(snapshot);
    const before = structuredClone(session);
    let attempts = 0;
    const engine = new PracticeTransactionEngine();

    const calculation = engine.calculate({
      session,
      snapshot,
      transaction: {
        type: 'submit',
        transactionId: 'transaction-1',
        baseRevision: 0,
        kind: 'direct',
        text: 'abc'
      },
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attempts}`
    });

    expect(session).toEqual(before);
    expect(calculation.kind).toBe('delta');
    if (calculation.kind !== 'delta') throw new Error('Expected a delta.');
    expect(calculation.delta.revision).toBe(1);
    expect(calculation.delta.attemptAdditions).toHaveLength(3);
    expect(calculation.receipt).toMatchObject({
      transactionId: 'transaction-1',
      baseRevision: 0,
      revision: 1,
      outcome: 'completed',
      consumedText: 'abc',
      unconsumedText: ''
    });

    engine.applyDelta(session, calculation.delta);
    expect(session.targetIndex).toBe(3);
    expect(session.revision).toBe(1);
    expect(session.status).toBe('completed');
    expect(session.transactionReceipts['transaction-1']).toEqual(calculation.receipt);
  });

  it('stops a blocked batch at the first error and returns the remainder', () => {
    const snapshot = createSnapshot('abc');
    const session = start(snapshot);
    const engine = new PracticeTransactionEngine();

    const calculation = engine.calculate({
      session,
      snapshot,
      transaction: {
        type: 'submit',
        transactionId: 'transaction-1',
        baseRevision: 0,
        kind: 'paste',
        text: 'abXrest'
      },
      wallTime: 1_100,
      nextAttemptId: sequence('input')
    });

    if (calculation.kind !== 'delta') throw new Error('Expected a delta.');
    expect(calculation.delta.attemptAdditions.map(attempt => attempt.actual))
      .toEqual(['a', 'b', 'X']);
    expect(calculation.receipt).toMatchObject({
      outcome: 'blocked',
      consumedText: 'abX',
      unconsumedText: 'rest'
    });
    engine.applyDelta(session, calculation.delta);
    expect(session.targetIndex).toBe(2);
    expect(session.blockedInputCount).toBe(1);
    expect(session.status).toBe('blockedOnError');
  });

  it('keeps allowSkip semantics and consumes Unicode graphemes', () => {
    const snapshot = createSnapshot('👩‍💻e\u0301', plan => ({
      ...plan,
      evaluation: { errorPolicy: 'allowSkip' }
    }));
    const session = start(snapshot);
    const engine = new PracticeTransactionEngine();

    const calculation = engine.calculate({
      session,
      snapshot,
      transaction: {
        type: 'submit',
        transactionId: 'transaction-1',
        baseRevision: 0,
        kind: 'composition',
        text: 'Xe\u0301'
      },
      wallTime: 1_100,
      nextAttemptId: sequence('input')
    });

    if (calculation.kind !== 'delta') throw new Error('Expected a delta.');
    expect(calculation.delta.attemptAdditions).toHaveLength(2);
    expect(calculation.delta.attemptAdditions.map(attempt => attempt.correct))
      .toEqual([false, true]);
    expect(calculation.receipt.outcome).toBe('completed');
  });

  it('keeps opposite smart quotes distinct in strict authoritative results', () => {
    const snapshot = createSnapshot('”', plan => ({
      ...plan,
      textPolicy: {
        ...plan.textPolicy,
        punctuation: { mode: 'strict', mappingVersion: 'strict-v1' }
      }
    }));
    const calculation = new PracticeTransactionEngine().calculate({
      session: start(snapshot),
      snapshot,
      transaction: {
        type: 'submit',
        transactionId: 'strict-quote',
        baseRevision: 0,
        kind: 'direct',
        text: '“'
      },
      wallTime: 1_100,
      nextAttemptId: sequence('input')
    });

    if (calculation.kind !== 'delta') throw new Error('Expected a delta.');
    expect(calculation.receipt.outcome).toBe('blocked');
    expect(calculation.delta.attemptAdditions[0]).toMatchObject({
      expected: '”',
      actual: '“',
      normalizedExpected: '”',
      normalizedActual: '“',
      correct: false
    });
  });

  it('corrects only the active blocked error and returns stable duplicate receipts', () => {
    const snapshot = createSnapshot('a');
    const session = start(snapshot);
    const engine = new PracticeTransactionEngine();
    const blocked = engine.calculate({
      session,
      snapshot,
      transaction: {
        type: 'submit',
        transactionId: 'submit-1',
        baseRevision: 0,
        kind: 'direct',
        text: 'X'
      },
      wallTime: 1_100,
      nextAttemptId: sequence('input')
    });
    if (blocked.kind !== 'delta') throw new Error('Expected a delta.');
    engine.applyDelta(session, blocked.delta);

    const duplicate = engine.calculate({
      session,
      snapshot,
      transaction: {
        type: 'submit',
        transactionId: 'submit-1',
        baseRevision: 0,
        kind: 'direct',
        text: 'X'
      },
      wallTime: 1_200,
      nextAttemptId: () => {
        throw new Error('duplicate must not allocate attempts');
      }
    });
    expect(duplicate).toEqual({
      kind: 'duplicate',
      receipt: blocked.receipt
    });

    const correction = engine.calculate({
      session,
      snapshot,
      transaction: {
        type: 'correct',
        transactionId: 'correct-1',
        baseRevision: 1
      },
      wallTime: 1_300,
      nextAttemptId: sequence('unused')
    });
    if (correction.kind !== 'delta') throw new Error('Expected a delta.');
    engine.applyDelta(session, correction.delta);

    expect(session.status).toBe('running');
    expect(session.blockedInputCount).toBe(0);
    expect(session.inputAttempts).toHaveLength(1);
    expect(session.correctionCounts.backspace).toBe(1);
    expect(session.revision).toBe(2);
  });
});

function start(snapshot: ReturnType<typeof createSnapshot>) {
  return new PracticeSessionEngine().start({
    sessionId: 'session-1',
    attemptId: 'attempt-1',
    snapshot,
    wallTime: 1_000,
    monotonicTime: 500
  });
}

function createSnapshot(
  text: string,
  transform: (plan: PracticePlan) => PracticePlan = plan => plan
) {
  const contentProfile = { kind: 'chinese', category: 'adHoc' } as const;
  const plan = transform(createDefaultPracticePlan({
    contentRecipe: { kind: 'adHoc', text },
    contentProfile
  }));
  return buildPracticeSnapshot({
    id: 'snapshot-1',
    createdAt: 900,
    plan,
    prepared: preparePracticeContent(text, {
      sourceRevision: 'test-revision',
      contentProfile,
      range: { kind: 'whole' }
    })
  });
}

function sequence(prefix: string): () => string {
  let value = 0;
  return () => `${prefix}-${++value}`;
}
