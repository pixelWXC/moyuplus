import type {
  PracticeSessionStorePort,
  PracticeSnapshotStorePort
} from '../../application/ports';
import type { PracticeSnapshot } from '../../domain/content';
import type {
  PracticeSessionState,
  PracticeSessionStatus
} from '../../domain/session';

type ActivePracticeStatus = Extract<
  PracticeSessionStatus,
  'ready' | 'running' | 'blockedOnError' | 'paused'
>;

export class ActivePracticeStateStore {
  private readonly snapshotValues = new Map<string, PracticeSnapshot>();
  private readonly sessionValues = new Map<string, PracticeSessionState>();

  readonly snapshots: PracticeSnapshotStorePort = {
    get: async snapshotId => clone(this.snapshotValues.get(snapshotId)),
    save: async snapshot => {
      this.snapshotValues.set(snapshot.id, clone(snapshot));
    }
  };

  readonly sessions: PracticeSessionStorePort = {
    get: async sessionId => clone(this.sessionValues.get(sessionId)),
    save: async session => {
      this.sessionValues.set(session.id, clone(session));
    }
  };

  async current(): Promise<{
    id: string;
    status: ActivePracticeStatus;
  } | undefined> {
    const active = [...this.sessionValues.values()]
      .filter(session => isActive(session.status))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    return active
      ? {
        id: active.id,
        status: active.status as ActivePracticeStatus
      }
      : undefined;
  }

  async currentSession(): Promise<PracticeSessionState | undefined> {
    const active = [...this.sessionValues.values()]
      .filter(session => isActive(session.status))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    return clone(active);
  }
}

function isActive(status: PracticeSessionStatus): status is ActivePracticeStatus {
  return status === 'ready'
    || status === 'running'
    || status === 'blockedOnError'
    || status === 'paused';
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}
