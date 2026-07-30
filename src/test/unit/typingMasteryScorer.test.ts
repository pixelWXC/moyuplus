import { describe, expect, it } from 'vitest';
import {
  PracticeSessionEngine,
  buildPracticeResult,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  decayMasteryEntry,
  preparePracticeContent,
  projectMasteryResults,
  type ContentProfile,
  type PracticeResult
} from '../../typing';

describe('mastery scoring', () => {
  it('removes a word after one clean reinforcement pass and requeues any failed pass', () => {
    const errorResult = createResult({
      text: '你好',
      actual: '你号',
      contentProfile: { kind: 'chinese', category: 'adHoc' },
      errorPolicy: 'allowSkip',
      endedAt: 10_000
    });
    const reinforcementResult = createResult({
      text: '你好',
      actual: '你好',
      contentProfile: { kind: 'mastery', category: 'word' },
      errorPolicy: 'block',
      endedAt: 20_000
    });
    const failedReinforcement = createResult({
      text: '你好',
      actual: '你号',
      contentProfile: { kind: 'mastery', category: 'word' },
      errorPolicy: 'block',
      endedAt: 30_000
    });

    const afterErrors = projectMasteryResults([errorResult]);
    const afterCleanPass = projectMasteryResults([
      reinforcementResult,
      errorResult
    ]);
    const afterFailedPass = projectMasteryResults([
      errorResult,
      failedReinforcement
    ]);

    expect(afterErrors).toHaveLength(1);
    expect(afterErrors[0]).toMatchObject({
      key: '你好',
      kind: 'word',
      wrongCount: 1,
      reinforcementCorrectStreak: 0,
      lastErrorAt: 10_000,
      algorithmVersion: 'mastery-v1'
    });
    expect(afterCleanPass).toEqual([]);
    expect(afterFailedPass).toContainEqual(expect.objectContaining({
      key: '你好',
      kind: 'word',
      wrongCount: 2
    }));

    const decayed = decayMasteryEntry(
      afterFailedPass[0],
      30_000 + (30 * 24 * 60 * 60 * 1_000)
    );
    expect(decayed.wrongCount).toBe(2);
    expect(decayed.score).toBeLessThan(afterFailedPass[0].score);
  });
});

function createResult(options: {
  text: string;
  actual: string;
  contentProfile: ContentProfile;
  errorPolicy: 'allowSkip' | 'block';
  endedAt: number;
}): PracticeResult {
  const plan = createDefaultPracticePlan({
    contentRecipe: { kind: 'adHoc', text: options.text },
    contentProfile: options.contentProfile
  });
  plan.evaluation = {
    ...plan.evaluation,
    errorPolicy: options.errorPolicy
  };
  const prepared = preparePracticeContent(options.text, {
    sourceRevision: `revision-${options.endedAt}`,
    contentProfile: options.contentProfile,
    range: { kind: 'whole' }
  });
  const snapshot = buildPracticeSnapshot({
    id: `snapshot-${options.endedAt}`,
    createdAt: 0,
    plan,
    prepared
  });
  const engine = new PracticeSessionEngine();
  const started = engine.start({
    sessionId: `session-${options.endedAt}`,
    attemptId: `attempt-${options.endedAt}`,
    snapshot,
    wallTime: 0,
    monotonicTime: 0
  });
  let inputId = 0;
  const completed = engine.input({
    session: started,
    snapshot,
    text: options.actual,
    origin: 'composition',
    wallTime: options.endedAt,
    nextAttemptId: () => `input-${options.endedAt}-${++inputId}`
  });
  return buildPracticeResult({
    id: `result-${options.endedAt}`,
    session: completed,
    snapshot,
    outcome: 'completed',
    wallTime: options.endedAt,
    monotonicTime: options.endedAt
  });
}
