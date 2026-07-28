import { describe, expect, it } from 'vitest';
import {
  PracticeSessionEngine,
  buildPracticeResult,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type ContentProfile
} from '../../typing';

describe('typing analytics', () => {
  it('keeps the original error after backspace and separates attempts from progress', () => {
    const contentProfile = { kind: 'chinese', category: 'adHoc' } as const;
    const plan = createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text: '你' },
      contentProfile
    });
    const prepared = preparePracticeContent('你', {
      sourceRevision: 'test-revision',
      contentProfile,
      range: { kind: 'whole' }
    });
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-1',
      createdAt: 0,
      plan,
      prepared
    });
    const engine = new PracticeSessionEngine();
    const started = engine.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    const wrong = engine.input({
      session: started,
      snapshot,
      text: '妮',
      origin: 'direct',
      wallTime: 11_000,
      nextAttemptId: () => 'input-1'
    });
    const corrected = engine.correct({
      session: wrong,
      kind: 'backspace',
      wallTime: 12_000
    });
    const completed = engine.input({
      session: corrected,
      snapshot,
      text: '你',
      origin: 'direct',
      wallTime: 61_000,
      nextAttemptId: () => 'input-2'
    });

    const result = buildPracticeResult({
      id: 'result-1',
      session: completed,
      snapshot,
      outcome: 'completed',
      wallTime: 61_000,
      monotonicTime: 60_500
    });

    expect(result.metrics).toMatchObject({
      totalAttempts: 2,
      correctAttempts: 1,
      errorAttempts: 1,
      accuracy: 50,
      completedUnits: 1,
      printableAttempts: 2,
      completedPrintableUnits: 1,
      completedHanzi: 1,
      rawCpm: 2,
      effectiveCpm: 1,
      hanziPerMinute: 1,
      longestCorrectStreak: 1,
      correctionCounts: expect.objectContaining({ backspace: 1 })
    });
    expect(result.errorPairs).toEqual([
      { expected: '你', actual: '妮', count: 1 }
    ]);
    expect(result.wallElapsedMs).toBe(60_000);
    expect(result.activeElapsedMs).toBe(60_000);
    expect(result.outcome).toBe('completed');
    expect(result.speedBuckets.reduce(
      (total, bucket) => total + bucket.correctAttempts + bucket.errorAttempts,
      0
    )).toBe(2);
    expect(result.speedBuckets.reduce(
      (total, bucket) => total + bucket.backspaces,
      0
    )).toBe(1);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('creates 10-second buckets with active time split across midnight and pauses', () => {
    const startedAt = Date.UTC(2026, 6, 23, 23, 59, 55);
    const { snapshot, engine, started } = createEnglishSession('abc', startedAt);
    let inputId = 0;
    const afterA = engine.input({
      session: started,
      snapshot,
      text: 'a',
      origin: 'direct',
      wallTime: startedAt + 5_000,
      nextAttemptId: () => `input-${++inputId}`
    });
    const paused = engine.pause(afterA, 10_000);
    const resumed = engine.resume(paused, 15_000);
    const afterB = engine.input({
      session: resumed,
      snapshot,
      text: 'b',
      origin: 'direct',
      wallTime: startedAt + 16_000,
      nextAttemptId: () => `input-${++inputId}`
    });
    const completed = engine.input({
      session: afterB,
      snapshot,
      text: 'c',
      origin: 'direct',
      wallTime: startedAt + 26_000,
      nextAttemptId: () => `input-${++inputId}`
    });

    const result = buildPracticeResult({
      id: 'result-buckets',
      session: completed,
      snapshot,
      outcome: 'completed',
      wallTime: startedAt + 30_000,
      monotonicTime: 30_000
    });

    expect(result.activeElapsedMs).toBe(25_000);
    expect(result.speedBuckets.map(bucket => ({
      wallStartedAt: bucket.wallStartedAt,
      activeElapsedMs: bucket.activeElapsedMs,
      correctAttempts: bucket.correctAttempts,
      rawCpm: bucket.rawCpm
    }))).toEqual([
      {
        wallStartedAt: startedAt,
        activeElapsedMs: 10_000,
        correctAttempts: 1,
        rawCpm: 6
      },
      {
        wallStartedAt: startedAt + 10_000,
        activeElapsedMs: 5_000,
        correctAttempts: 1,
        rawCpm: 12
      },
      {
        wallStartedAt: startedAt + 20_000,
        activeElapsedMs: 10_000,
        correctAttempts: 1,
        rawCpm: 6
      }
    ]);
    expect(new Date(result.speedBuckets[1].wallStartedAt).getUTCDate()).toBe(24);
  });

  it('aggregates error words from Chinese, English and code target context', () => {
    expect(createErrorResult(
      '你好世界',
      '你号世界',
      { kind: 'chinese', category: 'adHoc' }
    ).errorWords).toEqual([{ word: '你好', count: 1 }]);
    expect(createErrorResult(
      'hello',
      'hxllo',
      { kind: 'english', category: 'adHoc' }
    ).errorWords).toEqual([{ word: 'hello', count: 1 }]);
    expect(createErrorResult(
      'const',
      'conxt',
      { kind: 'code', language: 'typescript' }
    ).errorWords).toEqual([{ word: 'const', count: 1 }]);
  });
});

function createEnglishSession(text: string, wallTime: number) {
  const contentProfile = { kind: 'english', category: 'adHoc' } as const;
  const plan = createDefaultPracticePlan({
    contentRecipe: { kind: 'adHoc', text },
    contentProfile
  });
  const prepared = preparePracticeContent(text, {
    sourceRevision: 'english-revision',
    contentProfile,
    range: { kind: 'whole' }
  });
  const snapshot = buildPracticeSnapshot({
    id: 'snapshot-english',
    createdAt: wallTime,
    plan,
    prepared
  });
  const engine = new PracticeSessionEngine();
  const started = engine.start({
    sessionId: 'session-english',
    attemptId: 'attempt-english',
    snapshot,
    wallTime,
    monotonicTime: 0
  });
  return { snapshot, engine, started };
}

function createErrorResult(
  text: string,
  actual: string,
  contentProfile: ContentProfile
) {
  const plan = createDefaultPracticePlan({
    contentRecipe: { kind: 'adHoc', text },
    contentProfile
  });
  plan.evaluation = { ...plan.evaluation, errorPolicy: 'allowSkip' };
  const prepared = preparePracticeContent(text, {
    sourceRevision: `error-${contentProfile.kind}`,
    contentProfile,
    range: { kind: 'whole' }
  });
  const snapshot = buildPracticeSnapshot({
    id: `snapshot-${contentProfile.kind}`,
    createdAt: 0,
    plan,
    prepared
  });
  const engine = new PracticeSessionEngine();
  const started = engine.start({
    sessionId: `session-${contentProfile.kind}`,
    attemptId: `attempt-${contentProfile.kind}`,
    snapshot,
    wallTime: 0,
    monotonicTime: 0
  });
  let attemptId = 0;
  const completed = engine.input({
    session: started,
    snapshot,
    text: actual,
    origin: 'composition',
    wallTime: 60_000,
    nextAttemptId: () => `input-${++attemptId}`
  });
  return buildPracticeResult({
    id: `result-${contentProfile.kind}`,
    session: completed,
    snapshot,
    outcome: 'completed',
    wallTime: 60_000,
    monotonicTime: 60_000
  });
}
