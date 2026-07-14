import { toGitLogLoadRequest, type GitLogQuerySnapshot } from './gitLogQuery';
import type { GitLogLoadRequest, GitLogResult } from './gitLogService';

export type GitLogRefreshOutcome =
  | { status: 'success'; token: number; queryKey: string; result: GitLogResult }
  | { status: 'failure'; token: number; queryKey: string; error: unknown };

export interface GitLogRefreshRequestResult {
  token: number;
  disposition: 'started' | 'reused' | 'queued' | 'disposed';
}

export class GitLogRefreshController {
  private active: GitLogRefreshJob | undefined;
  private pending: PendingGitLogRefresh | undefined;
  private nextToken = 0;
  private disposed = false;

  constructor(
    private readonly load: (request: GitLogLoadRequest) => Promise<GitLogResult>,
    private readonly onOutcome: (outcome: GitLogRefreshOutcome) => void
  ) {}

  peekReusableToken(queryKey: string): number | undefined {
    return this.active?.snapshot.queryKey === queryKey && !this.active.abortRequested
      ? this.active.token
      : undefined;
  }

  request(snapshot: GitLogQuerySnapshot): GitLogRefreshRequestResult {
    if (this.disposed) return { token: 0, disposition: 'disposed' };
    const reusableToken = this.peekReusableToken(snapshot.queryKey);
    if (reusableToken !== undefined) return { token: reusableToken, disposition: 'reused' };

    const token = ++this.nextToken;
    if (!this.active) {
      this.start(snapshot, token);
      return { token, disposition: 'started' };
    }

    this.pending = { snapshot, token };
    if (!this.active.abortRequested) {
      this.active.abortRequested = true;
      this.active.abortController.abort();
    }
    return { token, disposition: 'queued' };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = undefined;
    if (this.active && !this.active.abortRequested) {
      this.active.abortRequested = true;
      this.active.abortController.abort();
    }
  }

  private start(snapshot: GitLogQuerySnapshot, token: number): void {
    const abortController = new AbortController();
    let promise: Promise<GitLogResult>;
    try {
      promise = this.load(toGitLogLoadRequest(snapshot, abortController.signal));
    } catch (error) {
      promise = Promise.reject(error);
    }
    const job: GitLogRefreshJob = { snapshot, token, abortController, promise, abortRequested: false };
    this.active = job;
    void this.observe(job);
  }

  private async observe(job: GitLogRefreshJob): Promise<void> {
    try {
      const result = await job.promise;
      if (!this.disposed && !job.abortRequested) {
        this.onOutcome({ status: 'success', token: job.token, queryKey: job.snapshot.queryKey, result });
      }
    } catch (error) {
      if (!this.disposed && !job.abortRequested) {
        this.onOutcome({ status: 'failure', token: job.token, queryKey: job.snapshot.queryKey, error });
      }
    } finally {
      if (this.active?.token !== job.token) return;
      this.active = undefined;
      if (this.disposed) {
        this.pending = undefined;
        return;
      }
      const pending = this.pending;
      this.pending = undefined;
      if (pending) this.start(pending.snapshot, pending.token);
    }
  }
}

interface GitLogRefreshJob {
  readonly snapshot: GitLogQuerySnapshot;
  readonly token: number;
  readonly abortController: AbortController;
  readonly promise: Promise<GitLogResult>;
  abortRequested: boolean;
}

interface PendingGitLogRefresh {
  readonly snapshot: GitLogQuerySnapshot;
  readonly token: number;
}
