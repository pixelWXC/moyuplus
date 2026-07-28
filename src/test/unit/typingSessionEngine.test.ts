import { describe, expect, it } from 'vitest';
import {
  PracticeSessionEngine,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type PracticePlan
} from '../../typing';

describe('PracticeSessionEngine', () => {
  it('evaluates a composition commit by Unicode grapheme instead of UTF-16 code unit', () => {
    const snapshot = createSnapshot('👩‍💻e\u0301');
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const next = engine.input({
      session,
      snapshot,
      text: '👩‍💻e\u0301',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(next.targetIndex).toBe(2);
    expect(next.status).toBe('completed');
    expect(next.inputAttempts).toEqual([
      expect.objectContaining({
        attemptId: 'input-1',
        targetIndex: 0,
        expected: '👩‍💻',
        actual: '👩‍💻',
        correct: true,
        origin: 'composition'
      }),
      expect.objectContaining({
        attemptId: 'input-2',
        targetIndex: 1,
        expected: 'e\u0301',
        actual: 'e\u0301',
        correct: true,
        origin: 'composition'
      })
    ]);
  });

  it('applies the snapshot punctuation equivalence table without losing raw values', () => {
    const snapshot = createSnapshot('，。');
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const next = engine.input({
      session,
      snapshot,
      text: ',.',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(next.status).toBe('completed');
    expect(next.inputAttempts.map(attempt => ({
      expected: attempt.expected,
      actual: attempt.actual,
      normalizedExpected: attempt.normalizedExpected,
      normalizedActual: attempt.normalizedActual,
      correct: attempt.correct
    }))).toEqual([
      {
        expected: '，',
        actual: ',',
        normalizedExpected: '，',
        normalizedActual: '，',
        correct: true
      },
      {
        expected: '。',
        actual: '.',
        normalizedExpected: '。',
        normalizedActual: '。',
        correct: true
      }
    ]);
  });

  it('blocks the target after an error until the blocked input is removed', () => {
    const snapshot = createSnapshot('abc');
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const blocked = engine.input({
      session,
      snapshot,
      text: 'xbc',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(blocked.status).toBe('blockedOnError');
    expect(blocked.targetIndex).toBe(0);
    expect(blocked.blockedInputCount).toBe(3);
    expect(blocked.inputAttempts.map(attempt => ({
      targetIndex: attempt.targetIndex,
      actual: attempt.actual,
      correct: attempt.correct
    }))).toEqual([
      { targetIndex: 0, actual: 'x', correct: false },
      { targetIndex: 0, actual: 'b', correct: false },
      { targetIndex: 0, actual: 'c', correct: false }
    ]);

    const corrected = engine.correct({
      session: blocked,
      kind: 'backspace',
      count: 3,
      wallTime: 1_200
    });
    expect(corrected.status).toBe('running');
    expect(corrected.blockedInputCount).toBe(0);
    expect(corrected.correctionCounts.backspace).toBe(3);

    const completed = engine.input({
      session: corrected,
      snapshot,
      text: 'abc',
      origin: 'composition',
      wallTime: 1_300,
      nextAttemptId: () => `input-${++attemptSequence}`
    });
    expect(completed.status).toBe('completed');
    expect(completed.targetIndex).toBe(3);
    expect(completed.inputAttempts).toHaveLength(6);
  });

  it('records an error and consumes the target when skipping errors is allowed', () => {
    const snapshot = createSnapshot('abc', plan => ({
      ...plan,
      evaluation: { ...plan.evaluation, errorPolicy: 'allowSkip' }
    }));
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const completed = engine.input({
      session,
      snapshot,
      text: 'xbc',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(completed.status).toBe('completed');
    expect(completed.targetIndex).toBe(3);
    expect(completed.blockedInputCount).toBe(0);
    expect(completed.inputAttempts.map(attempt => attempt.correct)).toEqual([false, true, true]);
  });

  it('ignores whitespace targets without changing the order of non-whitespace input', () => {
    const snapshot = createSnapshot('a \n\tb', plan => ({
      ...plan,
      textPolicy: {
        ...plan.textPolicy,
        whitespace: { mode: 'ignore' }
      }
    }));
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const completed = engine.input({
      session,
      snapshot,
      text: 'ab',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(completed.status).toBe('completed');
    expect(completed.targetIndex).toBe(snapshot.targetUnits.length);
    expect(completed.inputAttempts.map(attempt => attempt.expected)).toEqual(['a', 'b']);
  });

  it('freezes input while paused and excludes the paused monotonic interval', () => {
    const snapshot = createSnapshot('ab');
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });

    const paused = engine.pause(session, 1_500);
    expect(paused.status).toBe('paused');
    expect(paused.pausedAtMonotonic).toBe(1_500);
    expect(() => engine.input({
      session: paused,
      snapshot,
      text: 'a',
      origin: 'direct',
      wallTime: 2_100,
      nextAttemptId: () => 'input-1'
    })).toThrow('Practice input is not allowed while session is paused.');

    const resumed = engine.resume(paused, 2_000);
    expect(resumed.status).toBe('running');
    expect(resumed.pausedAtMonotonic).toBeUndefined();
    expect(resumed.accumulatedPausedMs).toBe(500);
  });

  it('advances across line breaks automatically without creating an input attempt', () => {
    const snapshot = createSnapshot('a\nb', plan => ({
      ...plan,
      textPolicy: {
        ...plan.textPolicy,
        whitespace: { mode: 'strict' }
      },
      flowPolicy: {
        ...plan.flowPolicy,
        lineAdvance: 'automatic'
      }
    }));
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const completed = engine.input({
      session,
      snapshot,
      text: 'ab',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(completed.status).toBe('completed');
    expect(completed.inputAttempts.map(attempt => attempt.expected)).toEqual(['a', 'b']);
  });

  it('collapses a target whitespace run into one equivalent whitespace attempt', () => {
    const snapshot = createSnapshot('a \t b', plan => ({
      ...plan,
      textPolicy: {
        ...plan.textPolicy,
        whitespace: { mode: 'collapse' }
      }
    }));
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const completed = engine.input({
      session,
      snapshot,
      text: 'a b',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(completed.status).toBe('completed');
    expect(completed.inputAttempts.map(attempt => ({
      expected: attempt.expected,
      actual: attempt.actual,
      normalizedExpected: attempt.normalizedExpected,
      normalizedActual: attempt.normalizedActual
    }))).toEqual([
      { expected: 'a', actual: 'a', normalizedExpected: 'a', normalizedActual: 'a' },
      { expected: ' ', actual: ' ', normalizedExpected: ' ', normalizedActual: ' ' },
      { expected: 'b', actual: 'b', normalizedExpected: 'b', normalizedActual: 'b' }
    ]);
  });

  it('completes at the deterministic target of a length constraint', () => {
    const snapshot = createSnapshot('abcde', plan => ({
      ...plan,
      completion: { kind: 'length', targetUnits: 2 }
    }));
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const completed = engine.input({
      session,
      snapshot,
      text: 'abc',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(completed.status).toBe('completed');
    expect(completed.targetIndex).toBe(2);
    expect(completed.inputAttempts.map(attempt => attempt.actual)).toEqual(['a', 'b']);
  });

  it('ignores only leading and trailing line whitespace in trimLineEdges mode', () => {
    const snapshot = createSnapshot('  a  \n \tb ', plan => ({
      ...plan,
      textPolicy: {
        ...plan.textPolicy,
        whitespace: { mode: 'trimLineEdges' }
      },
      flowPolicy: {
        ...plan.flowPolicy,
        lineAdvance: 'automatic'
      }
    }));
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    let attemptSequence = 0;

    const completed = engine.input({
      session,
      snapshot,
      text: 'ab',
      origin: 'composition',
      wallTime: 1_100,
      nextAttemptId: () => `input-${++attemptSequence}`
    });

    expect(completed.status).toBe('completed');
    expect(completed.inputAttempts.map(attempt => attempt.expected)).toEqual(['a', 'b']);
  });
});

function createSnapshot(
  text: string,
  transformPlan: (plan: PracticePlan) => PracticePlan = plan => plan
) {
  const contentProfile = { kind: 'chinese', category: 'adHoc' } as const;
  const plan = transformPlan(createDefaultPracticePlan({
    contentRecipe: { kind: 'adHoc', text },
    contentProfile
  }));
  const prepared = preparePracticeContent(text, {
    sourceRevision: 'test-revision',
    contentProfile,
    range: { kind: 'whole' }
  });
  return buildPracticeSnapshot({
    id: 'snapshot-1',
    createdAt: 900,
    plan,
    prepared
  });
}
