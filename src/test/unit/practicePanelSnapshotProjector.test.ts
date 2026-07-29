import { describe, expect, it } from 'vitest';
import {
  PracticePanelSnapshotProjector,
  PracticeSessionEngine,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent
} from '../../typing';

describe('PracticePanelSnapshotProjector', () => {
  it('projects only a bounded authoritative window for a large target', () => {
    const text = 'a'.repeat(2_000);
    const contentProfile = { kind: 'english', category: 'adHoc' } as const;
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-projector',
      createdAt: 1,
      plan: createDefaultPracticePlan({
        contentRecipe: { kind: 'adHoc', text },
        contentProfile
      }),
      prepared: preparePracticeContent(text, {
        sourceRevision: 'source-1',
        contentProfile,
        range: { kind: 'whole' }
      })
    });
    const session = new PracticeSessionEngine().start({
      sessionId: 'session-projector',
      attemptId: 'attempt-projector',
      snapshot,
      wallTime: 1,
      monotonicTime: 1
    });
    session.targetIndex = 1_000;

    const projected = new PracticePanelSnapshotProjector({
      before: 20,
      after: 40
    }).project(session, snapshot);

    expect(projected.window.units.length).toBeLessThanOrEqual(61);
    expect(projected.window.start).toBe(980);
    expect(projected.window.units.find(unit => unit.state === 'target'))
      .toMatchObject({ index: 1_000, text: 'a' });
    expect(projected.totalUnits).toBe(2_000);
    expect(projected.showMetrics).toBe(true);
    expect(projected.metrics.remaining).toEqual({
      kind: 'units',
      remainingUnits: 1_000
    });
  });

  it('projects live speed, accuracy, duration and timed remaining target', () => {
    const contentProfile = { kind: 'english', category: 'adHoc' } as const;
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-timed',
      createdAt: 1,
      plan: createDefaultPracticePlan({
        contentRecipe: { kind: 'adHoc', text: 'ab' },
        contentProfile,
        completion: { kind: 'timed', seconds: 60 }
      }),
      prepared: preparePracticeContent('ab', {
        sourceRevision: 'source-timed',
        contentProfile,
        range: { kind: 'whole' }
      })
    });
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'session-timed',
      attemptId: 'attempt-timed',
      snapshot,
      wallTime: 1,
      monotonicTime: 1
    });
    engine.input({
      session,
      snapshot,
      text: 'ax',
      origin: 'direct',
      wallTime: 1_001,
      nextAttemptId: () => `input-${session.inputAttempts.length + 1}`
    });

    const projected = new PracticePanelSnapshotProjector().project(
      session,
      snapshot,
      30_001
    );

    expect(projected.metrics.activeElapsedMs).toBe(30_000);
    expect(projected.metrics.currentCpm).toBe(2);
    expect(projected.metrics.accuracy).toBe(50);
    expect(projected.metrics.remaining).toEqual({
      kind: 'time',
      remainingMs: 30_000,
      totalMs: 60_000
    });
  });
});
