import { describe, expect, it } from 'vitest';
import {
  PracticeSessionRuntime,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent
} from '../../typing';

describe('PracticeSessionRuntime', () => {
  it('starts a new session at an explicitly selected material position', () => {
    const contentProfile = { kind: 'english', category: 'adHoc' } as const;
    const plan = createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text: 'abc' },
      contentProfile
    });
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-positioned',
      createdAt: 1_000,
      plan,
      prepared: preparePracticeContent('abc', {
        sourceRevision: 'positioned-v1',
        contentProfile,
        range: { kind: 'whole' }
      })
    });
    const runtime = new PracticeSessionRuntime();

    const positioned = runtime.start({
      sessionId: 'session-positioned',
      attemptId: 'attempt-positioned',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500,
      targetIndex: 1
    });

    expect(positioned.targetIndex).toBe(1);
    expect(positioned.startTargetIndex).toBe(1);
    expect(() => runtime.start({
      sessionId: 'session-invalid-position',
      attemptId: 'attempt-invalid-position',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500,
      targetIndex: snapshot.targetUnits.length
    })).toThrow('outside the selected range');
  });

  it('restarts with the same immutable snapshot and records the previous attempt', () => {
    const contentProfile = { kind: 'randomChinese', category: 'frequentHanzi' } as const;
    const plan = createDefaultPracticePlan({
      contentRecipe: {
        kind: 'generated',
        generator: 'frequentHanzi',
        seed: 'seed-1',
        length: 3
      },
      contentProfile
    });
    const prepared = preparePracticeContent('甲乙丙', {
      sourceRevision: 'generated-revision',
      contentProfile,
      generatorSeed: 'seed-1',
      range: { kind: 'whole' }
    });
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-1',
      createdAt: 1_000,
      plan,
      prepared
    });
    const runtime = new PracticeSessionRuntime();
    const started = runtime.start({
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    const attempted = runtime.input({
      session: started,
      snapshot,
      text: '甲',
      origin: 'direct',
      wallTime: 2_000,
      nextAttemptId: () => 'input-1'
    });

    const restarted = runtime.restart({
      session: attempted,
      snapshot,
      nextSessionId: 'session-2',
      nextAttemptId: 'attempt-2',
      resultId: 'result-1',
      wallTime: 3_000,
      monotonicTime: 2_500
    });

    expect(restarted.previousSession).toMatchObject({
      id: 'session-1',
      status: 'abandoned',
      endedAt: 3_000
    });
    expect(restarted.result).toMatchObject({
      id: 'result-1',
      outcome: 'restarted',
      snapshotId: snapshot.id,
      metrics: { totalAttempts: 1, correctAttempts: 1 }
    });
    expect(restarted.nextSession).toMatchObject({
      id: 'session-2',
      attemptId: 'attempt-2',
      snapshotId: snapshot.id,
      status: 'running',
      targetIndex: 0,
      inputAttempts: []
    });
    expect(snapshot.generatorSeed).toBe('seed-1');
  });

  it('finishes a timed constraint with a timedOut result after stable input is applied', () => {
    const contentProfile = { kind: 'english', category: 'adHoc' } as const;
    const plan = createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text: 'abc' },
      contentProfile,
      completion: { kind: 'timed', seconds: 60 }
    });
    const prepared = preparePracticeContent('abc', {
      sourceRevision: 'timed-revision',
      contentProfile,
      range: { kind: 'whole' }
    });
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-timed',
      createdAt: 0,
      plan,
      prepared
    });
    const runtime = new PracticeSessionRuntime();
    const started = runtime.start({
      sessionId: 'session-timed',
      attemptId: 'attempt-timed',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 0
    });
    const stable = runtime.input({
      session: started,
      snapshot,
      text: 'a',
      origin: 'composition',
      wallTime: 60_000,
      nextAttemptId: () => 'input-timed'
    });

    const finished = runtime.finish({
      session: stable,
      snapshot,
      resultId: 'result-timed',
      outcome: 'timedOut',
      wallTime: 61_000,
      monotonicTime: 60_000
    });

    expect(finished.session.status).toBe('completed');
    expect(finished.result).toMatchObject({
      outcome: 'timedOut',
      activeElapsedMs: 60_000,
      metrics: {
        totalAttempts: 1,
        correctAttempts: 1,
        completedUnits: 1
      }
    });
  });

});
