import { describe, expect, it, vi } from 'vitest';
import {
  PracticeApplicationCoordinator,
  PracticeSessionRuntime,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type PracticeApplicationPorts,
  type PracticeResult,
  type PracticeSessionState,
  type PracticeSnapshot
} from '../../typing';
import {
  InMemoryPracticeSessionStore,
  InMemoryPracticeSnapshotStore,
  ManualTypingClock,
  SequenceTypingIdGenerator
} from '../typing/helpers/inMemoryTypingPorts';

describe('PracticeApplicationCoordinator full session', () => {
  it('routes input and correction through the runtime and commits the completed result', async () => {
    const contentProfile = { kind: 'chinese', category: 'adHoc' } as const;
    const plan = createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text: '你' },
      contentProfile
    });
    const prepared = preparePracticeContent('你', {
      sourceRevision: 'integration-revision',
      contentProfile,
      range: { kind: 'whole' }
    });
    const clock = new ManualTypingClock(1_000, 500);
    const snapshots = new InMemoryPracticeSnapshotStore();
    const sessions = new InMemoryPracticeSessionStore();
    const committed: PracticeResult[] = [];
    const ports: PracticeApplicationPorts = {
      clock,
      ids: new SequenceTypingIdGenerator('integration'),
      content: { prepare: async () => prepared },
      snapshotBuilder: { build: buildPracticeSnapshot },
      snapshots,
      sessions,
      runtime: new PracticeSessionRuntime(),
      results: {
        async commit(result) {
          committed.push(structuredClone(result));
        }
      },
      lease: {
        acquire: vi.fn(async () => ({ acquired: true as const })),
        transition: vi.fn(async () => undefined),
        release: vi.fn(async () => undefined)
      },
      panel: {
        open: vi.fn(async () => undefined),
        render: vi.fn(async () => undefined),
        complete: vi.fn(async () => undefined)
      },
      events: { publish: vi.fn() }
    };
    const coordinator = new PracticeApplicationCoordinator(ports);
    const preparedEvent = await coordinator.prepare({
      type: 'prepare',
      plan,
      range: { kind: 'whole' }
    });
    const snapshot = (preparedEvent as { snapshot: PracticeSnapshot }).snapshot;
    const startedEvent = await coordinator.start({
      type: 'start',
      snapshotId: snapshot.id
    });
    const session = (startedEvent as { session: PracticeSessionState }).session;

    clock.advance(10_000);
    const wrong = await coordinator.input({
      type: 'input',
      sessionId: session.id,
      text: '妮',
      origin: 'direct'
    });
    expect(wrong).toMatchObject({
      type: 'practiceInputEvaluated',
      session: {
        status: 'blockedOnError',
        targetIndex: 0,
        blockedInputCount: 1
      }
    });

    clock.advance(1_000);
    await coordinator.correct({
      type: 'correct',
      sessionId: session.id,
      kind: 'backspace'
    });
    clock.advance(49_000);
    const completed = await coordinator.input({
      type: 'input',
      sessionId: session.id,
      text: '你',
      origin: 'direct'
    });

    expect(completed).toMatchObject({
      type: 'practiceInputEvaluated',
      session: { status: 'completed', targetIndex: 1 },
      result: {
        outcome: 'completed',
        metrics: {
          totalAttempts: 2,
          correctAttempts: 1,
          errorAttempts: 1,
          completedUnits: 1
        }
      }
    });
    expect(committed).toHaveLength(1);
    expect(committed[0]).toEqual((completed as { result: PracticeResult }).result);
    expect(ports.lease.release).toHaveBeenCalledWith(session.id);
    expect(ports.panel.complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
      committed[0]
    );
  });
});
