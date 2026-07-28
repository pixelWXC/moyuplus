import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  PracticePanelSnapshotProjector,
  PracticeSessionEngine,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type InputAttempt
} from '../../typing';

describe('typing performance budget', () => {
  it('keeps a single domain input O(1) with a long attempt history', () => {
    const snapshot = snapshotFor('a');
    const engine = new PracticeSessionEngine();
    let session = engine.start({
      sessionId: 'performance-session',
      attemptId: 'performance-attempt',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    session.inputAttempts = fixedAttempts(50_000);
    let attemptId = 50_000;
    const durations: number[] = [];

    for (let index = 0; index < 40; index += 1) {
      const startedAt = performance.now();
      session = engine.input({
        session,
        snapshot,
        text: 'x',
        origin: 'direct',
        wallTime: 2_000 + index,
        nextAttemptId: () => `performance-${++attemptId}`
      });
      durations.push(performance.now() - startedAt);
    }

    expect(percentile(durations, 0.95)).toBeLessThanOrEqual(16);
    expect(Math.max(...durations)).toBeLessThanOrEqual(50);
  }, 30_000);

  it('renders only the visible window of a 200k-grapheme snapshot within budget', () => {
    const lines = [
      'a'.repeat(200),
      ...Array.from({ length: 999 }, () => 'a'.repeat(199))
    ];
    const text = lines.join('\n');
    const snapshot = snapshotFor(text);
    expect(snapshot.targetUnits).toHaveLength(200_000);
    const engine = new PracticeSessionEngine();
    const session = engine.start({
      sessionId: 'large-performance-session',
      attemptId: 'large-performance-attempt',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    session.targetIndex = snapshot.displayLines[500].targetStart;
    const projector = new PracticePanelSnapshotProjector({
      before: 80,
      after: 160
    });
    const durations: number[] = [];

    for (let index = 0; index < 100; index += 1) {
      const startedAt = performance.now();
      const projected = projector.project(session, snapshot);
      durations.push(performance.now() - startedAt);
      expect(projected.window.units.length).toBeLessThanOrEqual(241);
    }

    expect(percentile(durations, 0.95)).toBeLessThanOrEqual(16);
    expect(Math.max(...durations)).toBeLessThanOrEqual(50);
  }, 30_000);
});

function snapshotFor(text: string) {
  const contentProfile = { kind: 'english', category: 'adHoc' } as const;
  return buildPracticeSnapshot({
    id: `performance-snapshot-${text.length}`,
    createdAt: 900,
    plan: createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text },
      contentProfile
    }),
    prepared: preparePracticeContent(text, {
      sourceRevision: `performance-revision-${text.length}`,
      contentProfile,
      range: { kind: 'whole' }
    })
  });
}

function fixedAttempts(length: number): InputAttempt[] {
  return Array.from({ length }, (_, index) => ({
    attemptId: `existing-${index}`,
    targetIndex: 0,
    expected: 'a',
    actual: 'x',
    normalizedExpected: 'a',
    normalizedActual: 'x',
    correct: false,
    timestamp: index,
    origin: 'direct'
  }));
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1)
  )];
}
