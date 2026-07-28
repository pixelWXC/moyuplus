import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  PracticePanelSnapshotProjector,
  PracticeSessionEngine,
  PracticeTransactionEngine,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent
} from '../../typing';
import {
  TypingPracticeInputStateMachine,
  createTypingPracticeInputState
} from '../../webview/typingPracticeInputState';

describe('typing practice panel performance', () => {
  it('keeps reducer, host transaction and bounded projection p95 below 50 ms', () => {
    const snapshot = largeSnapshot();
    const session = new PracticeSessionEngine().start({
      sessionId: 'performance-panel-session',
      attemptId: 'performance-panel-attempt',
      snapshot,
      wallTime: 1_000,
      monotonicTime: 500
    });
    const transactionEngine = new PracticeTransactionEngine();
    const projector = new PracticePanelSnapshotProjector();
    const machine = new TypingPracticeInputStateMachine({
      nextTransactionId: sequence => `performance-transaction-${sequence}`,
      nextCompositionId: sequence => `performance-composition-${sequence}`
    });
    let inputState = machine.dispatch(
      createTypingPracticeInputState('performance-panel'),
      { type: 'snapshot', revision: 0, status: 'running' }
    ).state;
    const reducerMs: number[] = [];
    const hostMs: number[] = [];
    const projectionMs: number[] = [];

    for (let index = 0; index < 100; index += 1) {
      let started = performance.now();
      inputState = machine.dispatch(inputState, {
        type: 'directInput',
        text: 'a',
        domChangeSequence: index + 1
      }).state;
      reducerMs.push(performance.now() - started);

      started = performance.now();
      const calculation = transactionEngine.calculate({
        session,
        snapshot,
        transaction: {
          type: 'submit',
          transactionId: `host-${index}`,
          baseRevision: session.revision,
          kind: 'direct',
          text: 'a'
        },
        wallTime: 2_000 + index,
        nextAttemptId: () => `input-${index}`
      });
      if (calculation.kind !== 'delta') {
        throw new Error('Performance transaction unexpectedly duplicated.');
      }
      transactionEngine.applyDelta(session, calculation.delta);
      hostMs.push(performance.now() - started);

      started = performance.now();
      const projected = projector.project(session, snapshot);
      projectionMs.push(performance.now() - started);
      expect(projected.window.units.length).toBeLessThanOrEqual(241);
    }

    expect(p95(reducerMs)).toBeLessThan(50);
    expect(p95(hostMs)).toBeLessThan(50);
    expect(p95(projectionMs)).toBeLessThan(50);
  }, 30_000);
});

function largeSnapshot() {
  const text = [
    'a'.repeat(200),
    ...Array.from({ length: 999 }, () => 'a'.repeat(199))
  ].join('\n');
  const contentProfile = { kind: 'english', category: 'adHoc' } as const;
  const plan = createDefaultPracticePlan({
    contentRecipe: { kind: 'adHoc', text },
    contentProfile
  });
  return buildPracticeSnapshot({
    id: 'performance-panel-snapshot',
    createdAt: 900,
    plan,
    prepared: preparePracticeContent(text, {
      sourceRevision: 'performance-panel-revision',
      contentProfile,
      range: { kind: 'whole' }
    })
  });
}

function p95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}
