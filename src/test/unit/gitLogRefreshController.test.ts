import { describe, expect, it, vi } from 'vitest';
import { GitLogRefreshController, type GitLogRefreshOutcome } from '../../git/gitLogRefreshController';
import type { GitLogQuerySnapshot } from '../../git/gitLogQuery';
import type { GitLogLoadRequest, GitLogResult } from '../../git/gitLogService';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function snapshot(key: string, maxCommits: number): GitLogQuerySnapshot {
  return Object.freeze({ workspaceRoots: Object.freeze([`D:/${key}`]), maxCommits, queryKey: key });
}

function result(key: string): GitLogResult {
  return {
    repositoryRoot: `D:/${key}`, repositoryName: key, branchName: 'main', detached: false,
    commits: [{ hash: key, subject: 'Ship', author: 'Purvar', authoredAt: 50 }], fingerprint: `fp-${key}`
  };
}

async function flushJobs(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('GitLogRefreshController', () => {
  it('starts once, reuses the active token for the same key, and emits one outcome', async () => {
    const loadDeferred = deferred<GitLogResult>();
    const load = vi.fn((_request: GitLogLoadRequest) => loadDeferred.promise);
    const outcomes: GitLogRefreshOutcome[] = [];
    const controller = new GitLogRefreshController(load, outcome => outcomes.push(outcome));

    const first = controller.request(snapshot('A', 100));
    for (let index = 0; index < 100; index += 1) {
      expect(controller.request(snapshot('A', 100))).toEqual({ token: first.token, disposition: 'reused' });
    }
    expect(controller.peekReusableToken('A')).toBe(first.token);
    expect(load).toHaveBeenCalledTimes(1);

    loadDeferred.resolve(result('A'));
    await flushJobs();

    expect(outcomes).toEqual([{ status: 'success', token: first.token, queryKey: 'A', result: result('A') }]);
    expect(controller.peekReusableToken('A')).toBeUndefined();
    expect(controller.request(snapshot('A', 100)).disposition).toBe('started');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('aborts a different active key but waits for settlement before starting only the latest pending request', async () => {
    const jobs: Array<{ request: GitLogLoadRequest; deferred: Deferred<GitLogResult> }> = [];
    let activeLoads = 0;
    let maxConcurrentLoads = 0;
    const load = vi.fn((request: GitLogLoadRequest) => {
      activeLoads += 1;
      maxConcurrentLoads = Math.max(maxConcurrentLoads, activeLoads);
      const job = deferred<GitLogResult>();
      jobs.push({ request, deferred: job });
      return job.promise.finally(() => { activeLoads -= 1; });
    });
    const outcomes: GitLogRefreshOutcome[] = [];
    const controller = new GitLogRefreshController(load, outcome => outcomes.push(outcome));

    const active = controller.request(snapshot('A', 100));
    expect(controller.request(snapshot('B', 200)).disposition).toBe('queued');
    expect(jobs[0].request.signal?.aborted).toBe(true);
    expect(controller.request(snapshot('C', 300)).disposition).toBe('queued');
    const latest = controller.request(snapshot('D', 400));
    expect(load).toHaveBeenCalledTimes(1);

    jobs[0].deferred.resolve(result('A'));
    await flushJobs();

    expect(outcomes).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(jobs[1].request.maxCommits).toBe(400);
    expect(maxConcurrentLoads).toBe(1);

    jobs[1].deferred.resolve(result('D'));
    await flushJobs();
    expect(outcomes).toEqual([{ status: 'success', token: latest.token, queryKey: 'D', result: result('D') }]);
    expect(active.token).not.toBe(latest.token);
  });

  it('never reuses an abort-requested job even when the latest request returns to its key', async () => {
    const jobs: Deferred<GitLogResult>[] = [];
    const load = vi.fn(() => {
      const job = deferred<GitLogResult>();
      jobs.push(job);
      return job.promise;
    });
    const outcomes: GitLogRefreshOutcome[] = [];
    const controller = new GitLogRefreshController(load, outcome => outcomes.push(outcome));

    const oldA = controller.request(snapshot('A', 100));
    controller.request(snapshot('B', 200));
    const newA = controller.request(snapshot('A', 300));
    expect(newA.token).not.toBe(oldA.token);
    expect(newA.disposition).toBe('queued');
    expect(controller.peekReusableToken('A')).toBeUndefined();

    jobs[0].reject(new Error('aborted runner ignored signal until exit'));
    await flushJobs();
    expect(outcomes).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);

    jobs[1].resolve(result('A'));
    await flushJobs();
    expect(outcomes).toEqual([{ status: 'success', token: newA.token, queryKey: 'A', result: result('A') }]);
  });

  it('reports a non-aborted failure once and continues accepting later work', async () => {
    const jobs: Deferred<GitLogResult>[] = [];
    const load = vi.fn(() => {
      const job = deferred<GitLogResult>();
      jobs.push(job);
      return job.promise;
    });
    const outcomes: GitLogRefreshOutcome[] = [];
    const controller = new GitLogRefreshController(load, outcome => outcomes.push(outcome));
    const request = controller.request(snapshot('A', 100));

    const error = new Error('failed');
    jobs[0].reject(error);
    await flushJobs();
    expect(outcomes).toEqual([{ status: 'failure', token: request.token, queryKey: 'A', error }]);
    expect(controller.request(snapshot('B', 200)).disposition).toBe('started');
  });

  it('disposes idempotently, clears pending, aborts active, and silences late settlement', async () => {
    const jobs: Array<{ request: GitLogLoadRequest; deferred: Deferred<GitLogResult> }> = [];
    const load = vi.fn((request: GitLogLoadRequest) => {
      const job = deferred<GitLogResult>();
      jobs.push({ request, deferred: job });
      return job.promise;
    });
    const outcomes: GitLogRefreshOutcome[] = [];
    const controller = new GitLogRefreshController(load, outcome => outcomes.push(outcome));

    controller.request(snapshot('A', 100));
    controller.request(snapshot('B', 200));
    controller.dispose();
    controller.dispose();
    expect(jobs[0].request.signal?.aborted).toBe(true);
    expect(controller.request(snapshot('C', 300)).disposition).toBe('disposed');

    jobs[0].deferred.resolve(result('A'));
    await flushJobs();
    expect(load).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual([]);
  });
});
