import { describe, expect, it } from 'vitest';
import {
  TYPING_SCHEMA_VERSION,
  migratePracticeCheckpoint,
  migratePracticePreferences,
  migratePracticeSnapshot
} from '../../typing';

const legacyPlan = {
  contentRecipe: { kind: 'adHoc', text: '主题' },
  completion: { kind: 'length', targetUnits: 2 },
  evaluation: { mode: 'committedBatch', errorPolicy: 'block' },
  textPolicy: {
    punctuation: { mode: 'equivalent', mappingVersion: 'zh-punctuation-v1' },
    whitespace: { mode: 'trimLineEdges' },
    caseSensitive: true
  },
  flowPolicy: { lineAdvance: 'automatic', presentation: 'continuous' },
  displayPolicy: { showLiveMetrics: true, showWhitespace: false }
};

describe('typing input architecture migration', () => {
  it('migrates v1 snapshot and preferences without preserving evaluation mode', () => {
    const snapshot = migratePracticeSnapshot({
      schemaVersion: 1,
      id: 'snapshot-1',
      sourceRevision: 'source-1',
      contentProfile: { kind: 'chinese', category: 'adHoc' },
      plan: legacyPlan,
      targetUnits: [],
      displayLines: [],
      selectedRange: { kind: 'whole' },
      createdAt: 10
    });
    const preferences = migratePracticePreferences({
      schemaVersion: 1,
      evaluation: legacyPlan.evaluation,
      textPolicy: legacyPlan.textPolicy,
      flowPolicy: legacyPlan.flowPolicy,
      displayPolicy: legacyPlan.displayPolicy
    });

    expect(snapshot.schemaVersion).toBe(TYPING_SCHEMA_VERSION);
    expect(snapshot.plan.evaluation).toEqual({ errorPolicy: 'block' });
    expect(preferences.evaluation).toEqual({ errorPolicy: 'block' });
  });

  it('adds revision and receipts while mapping legacy attempt origins', () => {
    const checkpoint = migratePracticeCheckpoint({
      schemaVersion: 1,
      session: {
        schemaVersion: 1,
        id: 'session-1',
        snapshotId: 'snapshot-1',
        attemptId: 'attempt-1',
        status: 'running',
        targetIndex: 1,
        blockedInputCount: 0,
        inputAttempts: [{
          attemptId: 'input-1',
          targetIndex: 0,
          expected: '主',
          actual: '主',
          normalizedExpected: '主',
          normalizedActual: '主',
          correct: true,
          timestamp: 10,
          origin: 'committedBatch'
        }],
        currentCorrectStreak: 1,
        longestCorrectStreak: 1,
        correctionCounts: {
          backspace: 0,
          delete: 0,
          undo: 0,
          redo: 0,
          selectionDelete: 0,
          other: 0
        },
        correctionEvents: [],
        pauseIntervals: [],
        createdAt: 10,
        updatedAt: 10
      },
      acceptedTextByLine: ['主'],
      savedAt: 10
    });

    expect(checkpoint.session.revision).toBe(0);
    expect(checkpoint.session.transactionReceipts).toEqual({});
    expect(checkpoint.session.inputAttempts[0]?.origin).toBe('composition');
  });

  it('is idempotent for already migrated values', () => {
    const once = migratePracticePreferences({
      schemaVersion: 1,
      evaluation: legacyPlan.evaluation,
      textPolicy: legacyPlan.textPolicy,
      flowPolicy: legacyPlan.flowPolicy,
      displayPolicy: legacyPlan.displayPolicy
    });

    expect(migratePracticePreferences(once)).toEqual(once);
  });
});
