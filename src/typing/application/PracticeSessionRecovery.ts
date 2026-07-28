import type {
  PracticeSnapshotStorePort,
  PracticeSessionStorePort
} from './ports';
import type { PracticeSnapshot } from '../domain/content';
import type {
  PracticeCheckpoint,
  PracticePauseInterval,
  PracticeSessionState
} from '../domain/session';

type RecoverablePracticeStatus = Extract<
  PracticeSessionState['status'],
  'ready' | 'running' | 'blockedOnError' | 'paused'
>;

export interface PracticeSessionRecoveryCandidate {
  checkpoint: PracticeCheckpoint;
  snapshot: PracticeSnapshot;
}

export interface PracticeSessionRecoverySourcePort {
  candidate(): PromiseLike<
    PracticeSessionRecoveryCandidate | undefined
  >;
  acquire(sessionId: string): PromiseLike<boolean>;
  release(sessionId: string): PromiseLike<void>;
}

export interface PracticeSessionRecoverySnapshot {
  status: RecoverablePracticeStatus;
  savedAt: number;
  completedUnits: number;
  totalUnits: number;
}

export interface PracticeSessionRecoveryOptions {
  source: PracticeSessionRecoverySourcePort;
  snapshots: PracticeSnapshotStorePort;
  sessions: PracticeSessionStorePort;
  panel: {
    restore(sessionId: string): PromiseLike<PracticeSessionState>;
    render(session: PracticeSessionState): PromiseLike<void>;
  };
  complete?(
    session: PracticeSessionState,
    snapshot: PracticeSnapshot
  ): PromiseLike<void>;
  clock: {
    monotonicNow(): number;
  };
}

export class PracticeSessionRecovery {
  private dismissedSessionId?: string;

  constructor(private readonly options: PracticeSessionRecoveryOptions) {}

  async snapshot(): Promise<PracticeSessionRecoverySnapshot | undefined> {
    const candidate = await this.options.source.candidate();
    if (!candidate || candidate.checkpoint.session.id === this.dismissedSessionId) {
      return undefined;
    }
    return {
      status: recoverableStatus(candidate.checkpoint.session.status),
      savedAt: candidate.checkpoint.savedAt,
      completedUnits: Math.min(
        candidate.checkpoint.session.targetIndex,
        candidate.snapshot.targetUnits.length
      ),
      totalUnits: candidate.snapshot.targetUnits.length
    };
  }

  async recover(): Promise<boolean> {
    const candidate = await this.options.source.candidate();
    if (!candidate) return false;
    const sessionId = candidate.checkpoint.session.id;
    if (!await this.options.source.acquire(sessionId)) return false;
    try {
      const checkpointSession = pauseOnCurrentMonotonicTimeline(
        candidate.checkpoint,
        this.options.clock.monotonicNow()
      );
      const restored = await this.options.panel.restore(sessionId);
      if (restored.status === 'completed') {
        await this.options.snapshots.save(candidate.snapshot);
        await this.options.sessions.save(restored);
        await this.options.complete?.(restored, candidate.snapshot);
        await this.options.source.release(sessionId);
        this.dismissedSessionId = sessionId;
        return false;
      }
      const session = restored.revision > checkpointSession.revision
        ? pauseRestoredSession(
          restored,
          this.options.clock.monotonicNow()
        )
        : checkpointSession;
      await this.options.snapshots.save(candidate.snapshot);
      await this.options.sessions.save(session);
      await this.options.panel.render(session);
      this.dismissedSessionId = undefined;
      return true;
    } catch (error) {
      await this.options.source.release(sessionId);
      throw error;
    }
  }

  async dismiss(): Promise<void> {
    const candidate = await this.options.source.candidate();
    this.dismissedSessionId = candidate?.checkpoint.session.id;
  }
}

function pauseRestoredSession(
  restored: PracticeSessionState,
  monotonicNow: number
): PracticeSessionState {
  return pauseOnCurrentMonotonicTimeline({
    schemaVersion: restored.schemaVersion,
    session: restored,
    acceptedTextByLine: [],
    savedAt: restored.updatedAt
  }, monotonicNow);
}

function pauseOnCurrentMonotonicTimeline(
  checkpoint: PracticeCheckpoint,
  monotonicNow: number
): PracticeSessionState {
  const session = structuredClone(checkpoint.session);
  const previousReference = session.pausedAtMonotonic
    ?? (
      session.startedAtMonotonic === undefined
        ? monotonicNow
        : session.startedAtMonotonic + Math.max(
          0,
          checkpoint.savedAt - (session.startedAt ?? checkpoint.savedAt)
        )
    );
  const shift = monotonicNow - previousReference;
  if (session.startedAtMonotonic !== undefined) {
    session.startedAtMonotonic += shift;
  }
  session.pauseIntervals = session.pauseIntervals.map(interval =>
    shiftPauseInterval(interval, shift)
  );
  if (session.status !== 'paused') {
    session.pauseIntervals.push({ startedAtMonotonic: monotonicNow });
  } else {
    const openPause = session.pauseIntervals.at(-1);
    if (!openPause || openPause.endedAtMonotonic !== undefined) {
      session.pauseIntervals.push({ startedAtMonotonic: monotonicNow });
    }
  }
  session.status = 'paused';
  session.pausedAtMonotonic = monotonicNow;
  return session;
}

function shiftPauseInterval(
  interval: PracticePauseInterval,
  shift: number
): PracticePauseInterval {
  return {
    startedAtMonotonic: interval.startedAtMonotonic + shift,
    ...(interval.endedAtMonotonic === undefined
      ? {}
      : { endedAtMonotonic: interval.endedAtMonotonic + shift })
  };
}

function recoverableStatus(
  status: PracticeSessionState['status']
): RecoverablePracticeStatus {
  return status === 'running'
    || status === 'blockedOnError'
    || status === 'paused'
    ? status
    : 'ready';
}
