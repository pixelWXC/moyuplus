import type {
  PracticeSessionLeaseAcquireResult,
  PracticeSessionLeasePort
} from '../../application/ports';
import type {
  PracticeSessionRecoveryCandidate
} from '../../application/PracticeSessionRecovery';
import type { PracticeSessionStatus } from '../../domain/session';
import {
  SessionLeaseHeartbeat,
  SessionLeaseStore
} from './SessionLeaseStore';
import { WorkspaceSessionStore } from './WorkspaceSessionStore';

type ActivePracticeSessionStatus = Extract<
  PracticeSessionStatus,
  'ready' | 'running' | 'blockedOnError' | 'paused'
>;

export interface WorkspacePracticeSessionLeaseOptions {
  heartbeatIntervalMs?: number;
  onHeartbeatError?: (error: unknown) => void | Promise<void>;
}

export class WorkspacePracticeSessionLease
implements PracticeSessionLeasePort {
  private activeHeartbeat?: {
    sessionId: string;
    lifecycle: SessionLeaseHeartbeat;
  };

  constructor(
    private readonly store: SessionLeaseStore,
    private readonly workspace: Pick<
      WorkspaceSessionStore,
      | 'getActiveSessionId'
      | 'getCheckpoint'
      | 'getSnapshot'
      | 'saveActiveSession'
    >,
    private readonly options: WorkspacePracticeSessionLeaseOptions = {}
  ) {}

  async acquire(
    sessionId: string
  ): Promise<PracticeSessionLeaseAcquireResult> {
    const result = await this.store.acquire(sessionId);
    if (!result.acquired) {
      const checkpoint = await this.workspace.getCheckpoint(
        result.lease.sessionId
      );
      return {
        acquired: false,
        activeSession: {
          id: result.lease.sessionId,
          status: activeStatus(checkpoint?.session.status)
        }
      };
    }
    await this.stopHeartbeat();
    this.startHeartbeat(sessionId);
    return { acquired: true };
  }

  async recoveryCandidate(): Promise<
    PracticeSessionRecoveryCandidate | undefined
  > {
    const [activeSessionId, inspection] = await Promise.all([
      this.workspace.getActiveSessionId(),
      this.store.inspect()
    ]);
    if (inspection?.active) return undefined;
    const sessionId = activeSessionId ?? inspection?.lease.sessionId;
    if (!sessionId) return undefined;
    const [checkpoint, snapshot] = await Promise.all([
      this.workspace.getCheckpoint(sessionId),
      this.workspace.getSnapshot(sessionId)
    ]);
    if (
      !checkpoint
      || !snapshot
      || checkpoint.session.snapshotId !== snapshot.id
      || !isRecoverable(checkpoint.session.status)
    ) {
      return undefined;
    }
    return { checkpoint, snapshot };
  }

  async claimRecovery(sessionId: string): Promise<boolean> {
    if (!await this.store.claimRecoverable(sessionId)) return false;
    await this.stopHeartbeat();
    await this.workspace.saveActiveSession(sessionId);
    this.startHeartbeat(sessionId);
    return true;
  }

  async transition(
    currentSessionId: string,
    nextSessionId: string
  ): Promise<void> {
    await this.store.transition(currentSessionId, nextSessionId);
    await this.stopHeartbeat();
    await this.workspace.saveActiveSession(nextSessionId);
    this.startHeartbeat(nextSessionId);
  }

  async release(sessionId: string): Promise<void> {
    if (this.activeHeartbeat?.sessionId === sessionId) {
      await this.stopHeartbeat();
    }
    await this.store.release(sessionId);
  }

  async dispose(): Promise<void> {
    const sessionId = this.activeHeartbeat?.sessionId;
    if (sessionId) {
      await this.release(sessionId);
    }
  }

  private startHeartbeat(sessionId: string): void {
    const lifecycle = new SessionLeaseHeartbeat({
      sessionId,
      lease: this.store,
      intervalMs: this.options.heartbeatIntervalMs,
      onError: this.options.onHeartbeatError
    });
    lifecycle.start();
    this.activeHeartbeat = { sessionId, lifecycle };
  }

  private async stopHeartbeat(): Promise<void> {
    const active = this.activeHeartbeat;
    this.activeHeartbeat = undefined;
    await active?.lifecycle.stop({ release: false });
  }
}

function activeStatus(
  status: PracticeSessionStatus | undefined
): ActivePracticeSessionStatus {
  return status === 'running'
    || status === 'blockedOnError'
    || status === 'paused'
    ? status
    : 'ready';
}

function isRecoverable(status: PracticeSessionStatus): boolean {
  return status === 'ready'
    || status === 'running'
    || status === 'blockedOnError'
    || status === 'paused';
}
