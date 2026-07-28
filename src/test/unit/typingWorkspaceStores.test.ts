import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PracticeSessionRuntime,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent,
  type PracticeCheckpoint,
  type PracticeResult
} from '../../typing';
import {
  PendingResultStore,
  ResilientPracticeResultCommitter,
  SessionLeaseHeartbeat,
  SessionLeaseStore,
  WorkspacePracticeSessionLease,
  WorkspaceSessionStore
} from '../../typing/adapters/storage';

const temporaryRoots: string[] = [];

describe('WorkspaceSessionStore', () => {
  afterEach(cleanTemporaryRoots);

  it('atomically restores the immutable snapshot and latest input checkpoint by session id', async () => {
    const root = await temporaryRoot();
    const { snapshot, checkpoint } = createArtifacts();
    const store = new WorkspaceSessionStore(root);

    await store.saveSnapshot(checkpoint.session.id, snapshot);
    await store.saveCheckpoint(checkpoint);

    const reopened = new WorkspaceSessionStore(root);
    await expect(reopened.getSnapshot(checkpoint.session.id)).resolves.toEqual(snapshot);
    await expect(reopened.getCheckpoint(checkpoint.session.id)).resolves.toEqual(checkpoint);

    const persisted = JSON.parse(await readFile(path.join(
      root,
      'typing',
      'sessions',
      checkpoint.session.id,
      'checkpoint.v1.json'
    ), 'utf8'));
    expect(persisted).toEqual(checkpoint);
  });
});

describe('PendingResultStore', () => {
  afterEach(cleanTemporaryRoots);

  it('retains a failed result and removes it only after the global fact commit succeeds', async () => {
    const root = await temporaryRoot();
    const { checkpoint, result } = createArtifacts();
    const store = new PendingResultStore(root);
    const commit = vi.fn()
      .mockRejectedValueOnce(new Error('global result storage unavailable'))
      .mockResolvedValueOnce(undefined);

    await store.save(checkpoint.session.id, result);
    await expect(store.retry(checkpoint.session.id, { commit }))
      .rejects.toThrow('global result storage unavailable');
    await expect(store.get(checkpoint.session.id)).resolves.toEqual(result);

    await expect(store.retry(checkpoint.session.id, { commit })).resolves.toBe('committed');
    await expect(store.get(checkpoint.session.id)).resolves.toBeUndefined();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('captures global commit failures and retries every pending workspace result on activation', async () => {
    const root = await temporaryRoot();
    const { result } = createArtifacts();
    const pending = new PendingResultStore(root);
    const commit = vi.fn()
      .mockRejectedValueOnce(new Error('global storage offline'))
      .mockResolvedValue(undefined);
    const committer = new ResilientPracticeResultCommitter(
      { commit },
      pending
    );

    await expect(committer.commit(result)).resolves.toBeUndefined();
    await expect(pending.get(result.sessionId)).resolves.toEqual(result);

    await expect(committer.retryPending()).resolves.toEqual({
      committedSessionIds: [result.sessionId],
      failedSessionIds: []
    });
    await expect(pending.get(result.sessionId)).resolves.toBeUndefined();
    expect(commit).toHaveBeenCalledTimes(2);
  });
});

describe('SessionLeaseStore', () => {
  afterEach(cleanTemporaryRoots);

  it('allows one writer, heartbeats the owner and permits takeover only after timeout', async () => {
    const root = await temporaryRoot();
    let now = 1_000;
    const windowA = new SessionLeaseStore(root, {
      ownerId: 'window-a',
      now: () => now,
      timeoutMs: 5_000,
      retryDelayMs: 1
    });
    const windowB = new SessionLeaseStore(root, {
      ownerId: 'window-b',
      now: () => now,
      timeoutMs: 5_000,
      retryDelayMs: 1
    });

    const [attemptA, attemptB] = await Promise.all([
      windowA.acquire('session-workspace'),
      windowB.acquire('session-workspace')
    ]);
    const winner = attemptA.acquired ? windowA : windowB;
    const loser = attemptA.acquired ? windowB : windowA;
    expect([attemptA.acquired, attemptB.acquired].filter(Boolean)).toHaveLength(1);
    expect(attemptA.acquired ? attemptB : attemptA).toMatchObject({
      acquired: false,
      lease: { sessionId: 'session-workspace' }
    });

    now = 4_000;
    await expect(winner.heartbeat('session-workspace')).resolves.toMatchObject({
      heartbeat: 1,
      updatedAt: 4_000
    });
    await expect(loser.acquire('session-workspace')).resolves.toMatchObject({
      acquired: false,
      lease: { updatedAt: 4_000 }
    });

    now = 9_001;
    await expect(loser.acquire('session-workspace')).resolves.toMatchObject({
      acquired: true,
      takenOver: true,
      lease: {
        sessionId: 'session-workspace',
        heartbeat: 0,
        updatedAt: 9_001
      }
    });
    await expect(winner.release('session-workspace')).resolves.toBe(false);
    await expect(loser.release('session-workspace')).resolves.toBe(true);
    await expect(loser.read()).resolves.toBeUndefined();
  });

  it('heartbeats while active and releases the owner lease on controlled shutdown', async () => {
    let scheduled: (() => void | Promise<void>) | undefined;
    const heartbeat = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      sessionId: 'session-workspace',
      ownerId: 'window-a',
      heartbeat: 1,
      updatedAt: 2_000
    });
    const release = vi.fn().mockResolvedValue(true);
    const cancel = vi.fn();
    const lifecycle = new SessionLeaseHeartbeat({
      sessionId: 'session-workspace',
      lease: { heartbeat, release },
      intervalMs: 1_000,
      schedule(callback) {
        scheduled = callback;
        return callback;
      },
      cancel
    });

    lifecycle.start();
    await scheduled?.();
    expect(heartbeat).toHaveBeenCalledWith('session-workspace');

    await lifecycle.stop();
    expect(cancel).toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith('session-workspace');
  });

  it('atomically transfers an owned lease to a restarted session', async () => {
    const root = await temporaryRoot();
    const store = new SessionLeaseStore(root, {
      ownerId: 'window-a',
      now: () => 2_000,
      retryDelayMs: 1
    });

    await expect(store.acquire('session-original')).resolves.toMatchObject({
      acquired: true
    });
    await expect(
      store.transition('session-original', 'session-restarted')
    ).resolves.toMatchObject({
      sessionId: 'session-restarted',
      ownerId: 'window-a',
      heartbeat: 0,
      updatedAt: 2_000
    });
    await expect(store.read()).resolves.toMatchObject({
      sessionId: 'session-restarted',
      ownerId: 'window-a'
    });
  });

  it('can stop heartbeat scheduling without releasing during an atomic transfer', async () => {
    const release = vi.fn().mockResolvedValue(true);
    const cancel = vi.fn();
    const lifecycle = new SessionLeaseHeartbeat({
      sessionId: 'session-original',
      lease: {
        heartbeat: vi.fn().mockResolvedValue(undefined),
        release
      },
      schedule: () => 'timer',
      cancel
    });

    lifecycle.start();
    await lifecycle.stop({ release: false });

    expect(cancel).toHaveBeenCalledWith('timer');
    expect(release).not.toHaveBeenCalled();
  });

  it('adapts a competing workspace lease into an authoritative application conflict', async () => {
    const root = await temporaryRoot();
    const workspace = new WorkspaceSessionStore(root);
    const { checkpoint } = createArtifacts();
    await workspace.saveCheckpoint({
      ...checkpoint,
      session: {
        ...checkpoint.session,
        status: 'paused'
      }
    });
    const windowA = new WorkspacePracticeSessionLease(
      new SessionLeaseStore(root, {
        ownerId: 'window-a',
        retryDelayMs: 1
      }),
      workspace
    );
    const windowB = new WorkspacePracticeSessionLease(
      new SessionLeaseStore(root, {
        ownerId: 'window-b',
        retryDelayMs: 1
      }),
      workspace
    );

    await expect(windowA.acquire(checkpoint.session.id)).resolves.toEqual({
      acquired: true
    });
    await expect(windowB.acquire('session-candidate')).resolves.toEqual({
      acquired: false,
      activeSession: {
        id: checkpoint.session.id,
        status: 'paused'
      }
    });

    await windowA.release(checkpoint.session.id);
  });

  it('exposes only an expired lease with complete workspace artifacts for recovery', async () => {
    const root = await temporaryRoot();
    let now = 1_000;
    const workspace = new WorkspaceSessionStore(root);
    const { checkpoint, snapshot } = createArtifacts();
    await workspace.saveSnapshot(checkpoint.session.id, snapshot);
    await workspace.saveCheckpoint(checkpoint);
    const owner = new WorkspacePracticeSessionLease(
      new SessionLeaseStore(root, {
        ownerId: 'window-a',
        now: () => now,
        timeoutMs: 5_000,
        retryDelayMs: 1
      }),
      workspace
    );
    const recovery = new WorkspacePracticeSessionLease(
      new SessionLeaseStore(root, {
        ownerId: 'window-b',
        now: () => now,
        timeoutMs: 5_000,
        retryDelayMs: 1
      }),
      workspace
    );
    await owner.acquire(checkpoint.session.id);

    await expect(recovery.recoveryCandidate()).resolves.toBeUndefined();

    now = 6_001;
    await expect(recovery.recoveryCandidate()).resolves.toEqual({
      checkpoint,
      snapshot
    });
    await expect(
      recovery.claimRecovery(checkpoint.session.id)
    ).resolves.toBe(true);
    await recovery.release(checkpoint.session.id);
  });

  it('does not overwrite a different stale session during a delayed recovery claim', async () => {
    const root = await temporaryRoot();
    let now = 1_000;
    const workspace = new WorkspaceSessionStore(root);
    const { checkpoint, snapshot } = createArtifacts();
    await workspace.saveSnapshot(checkpoint.session.id, snapshot);
    await workspace.saveCheckpoint(checkpoint);
    const original = new SessionLeaseStore(root, {
      ownerId: 'window-a',
      now: () => now,
      timeoutMs: 5_000,
      retryDelayMs: 1
    });
    const recoveryStore = new SessionLeaseStore(root, {
      ownerId: 'window-b',
      now: () => now,
      timeoutMs: 5_000,
      retryDelayMs: 1
    });
    const replacement = new SessionLeaseStore(root, {
      ownerId: 'window-c',
      now: () => now,
      timeoutMs: 5_000,
      retryDelayMs: 1
    });
    const recovery = new WorkspacePracticeSessionLease(
      recoveryStore,
      workspace
    );
    await original.acquire(checkpoint.session.id);
    now = 6_001;
    await expect(recovery.recoveryCandidate()).resolves.toBeDefined();
    await replacement.acquire('session-replacement');
    now = 12_002;

    await expect(
      recovery.claimRecovery(checkpoint.session.id)
    ).resolves.toBe(false);
    await expect(recoveryStore.read()).resolves.toMatchObject({
      sessionId: 'session-replacement',
      ownerId: 'window-c'
    });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-workspace-'));
  temporaryRoots.push(root);
  return root;
}

async function cleanTemporaryRoots(): Promise<void> {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporaryRoots.splice(0).map(root =>
    rm(root, { recursive: true, force: true })
  ));
}

function createArtifacts(): {
  checkpoint: PracticeCheckpoint;
  result: PracticeResult;
  snapshot: ReturnType<typeof buildPracticeSnapshot>;
} {
  const contentProfile = { kind: 'english', category: 'adHoc' } as const;
  const plan = createDefaultPracticePlan({
    contentRecipe: { kind: 'adHoc', text: 'ab' },
    contentProfile
  });
  const prepared = preparePracticeContent('ab', {
    sourceRevision: 'workspace-revision',
    contentProfile,
    range: { kind: 'whole' }
  });
  const snapshot = buildPracticeSnapshot({
    id: 'snapshot-workspace',
    createdAt: 1_000,
    plan,
    prepared
  });
  const runtime = new PracticeSessionRuntime();
  const started = runtime.start({
    sessionId: 'session-workspace',
    attemptId: 'attempt-workspace',
    snapshot,
    wallTime: 1_000,
    monotonicTime: 500
  });
  const session = runtime.input({
    session: started,
    snapshot,
    text: 'a',
    origin: 'direct',
    wallTime: 2_000,
    nextAttemptId: () => 'input-workspace'
  });
  const checkpoint: PracticeCheckpoint = {
    schemaVersion: 1,
    session,
    acceptedTextByLine: ['a'],
    lastStableDocumentVersion: 3,
    savedAt: 2_000
  };
  const finished = runtime.finish({
    session,
    snapshot,
    resultId: 'result-workspace',
    outcome: 'abandoned',
    wallTime: 3_000,
    monotonicTime: 2_500
  });
  if (!finished.result) {
    throw new Error('Expected an attempted session to produce a result.');
  }
  return { checkpoint, result: finished.result, snapshot };
}
