import { describe, expect, it, vi } from 'vitest';
import {
  PracticeSessionRecovery,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type PracticeCheckpoint
} from '../../typing';

function createRecoveryArtifacts() {
  const contentProfile = { kind: 'english', category: 'adHoc' } as const;
  const snapshot = buildPracticeSnapshot({
    id: 'snapshot-recovery',
    createdAt: 1_000,
    plan: createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text: 'ab' },
      contentProfile
    }),
    prepared: preparePracticeContent('ab', {
      sourceRevision: 'recovery-v1',
      contentProfile,
      range: { kind: 'whole' }
    })
  });
  const checkpoint: PracticeCheckpoint = {
    schemaVersion: 1,
    session: {
      schemaVersion: 1,
      id: 'session-stale',
      snapshotId: snapshot.id,
      attemptId: 'attempt-stale',
      status: 'running',
      revision: 0,
      transactionReceipts: {},
      targetIndex: 1,
      blockedInputCount: 0,
      inputAttempts: [],
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
      createdAt: 1_000,
      updatedAt: 2_000,
      startedAt: 1_000,
      startedAtMonotonic: 500,
      accumulatedPausedMs: 0
    },
    acceptedTextByLine: ['a'],
    savedAt: 2_000
  };
  return { checkpoint, snapshot };
}

function createHarness(acquired = true) {
  const candidate = createRecoveryArtifacts();
  const source = {
    candidate: vi.fn(async () => candidate),
    acquire: vi.fn(async () => acquired),
    release: vi.fn(async () => undefined)
  };
  const snapshots = {
    get: vi.fn(),
    save: vi.fn(async () => undefined)
  };
  const sessions = {
    get: vi.fn(),
    save: vi.fn(async () => undefined)
  };
  const panel = {
    restore: vi.fn(async () => candidate.checkpoint.session),
    render: vi.fn(async () => undefined)
  };
  const complete = vi.fn(async () => undefined);
  return {
    candidate,
    source,
    snapshots,
    sessions,
    panel,
    complete,
    recovery: new PracticeSessionRecovery({
      source,
      snapshots,
      sessions,
      panel,
      complete,
      clock: {
        monotonicNow: () => 10_000
      }
    })
  };
}

describe('PracticeSessionRecovery', () => {
  it('projects a recoverable checkpoint without exposing its session id', async () => {
    const harness = createHarness();

    await expect(harness.recovery.snapshot()).resolves.toEqual({
      status: 'running',
      savedAt: 2_000,
      completedUnits: 1,
      totalUnits: 2
    });
  });

  it('claims the stale session, rebases monotonic time and restores it paused', async () => {
    const harness = createHarness();

    await expect(harness.recovery.recover()).resolves.toBe(true);

    expect(harness.source.acquire).toHaveBeenCalledWith('session-stale');
    expect(harness.snapshots.save).toHaveBeenCalledWith(harness.candidate.snapshot);
    expect(harness.sessions.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'session-stale',
      status: 'paused',
      startedAtMonotonic: 9_000,
      pausedAtMonotonic: 10_000,
      pauseIntervals: [{
        startedAtMonotonic: 10_000
      }]
    }));
    expect(harness.panel.restore).toHaveBeenCalledWith('session-stale');
    expect(harness.panel.render).toHaveBeenCalledWith(expect.objectContaining({
      id: 'session-stale',
      status: 'paused'
    }));
    expect(harness.source.release).not.toHaveBeenCalled();
  });

  it('does not restore when another window wins the takeover race', async () => {
    const harness = createHarness(false);

    await expect(harness.recovery.recover()).resolves.toBe(false);

    expect(harness.snapshots.save).not.toHaveBeenCalled();
    expect(harness.sessions.save).not.toHaveBeenCalled();
    expect(harness.panel.restore).not.toHaveBeenCalled();
  });

  it('finalizes a completed journal replay without reopening the panel', async () => {
    const harness = createHarness();
    const completed = {
      ...structuredClone(harness.candidate.checkpoint.session),
      status: 'completed' as const,
      revision: 1,
      targetIndex: 2,
      endedAt: 2_100,
      updatedAt: 2_100
    };
    harness.panel.restore.mockResolvedValueOnce(completed);

    await expect(harness.recovery.recover()).resolves.toBe(false);

    expect(harness.sessions.save).toHaveBeenCalledWith(completed);
    expect(harness.complete).toHaveBeenCalledWith(
      completed,
      harness.candidate.snapshot
    );
    expect(harness.panel.render).not.toHaveBeenCalled();
    expect(harness.source.release).toHaveBeenCalledWith('session-stale');
  });

  it('dismisses only the current host prompt and leaves recovery data intact', async () => {
    const harness = createHarness();

    await harness.recovery.dismiss();

    await expect(harness.recovery.snapshot()).resolves.toBeUndefined();
    expect(harness.source.release).not.toHaveBeenCalled();
  });
});
