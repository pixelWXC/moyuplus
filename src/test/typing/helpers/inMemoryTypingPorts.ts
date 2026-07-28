import type {
  ClockPort,
  IdGeneratorPort,
  PracticeSessionState,
  PracticeSessionStorePort,
  PracticeSnapshot,
  PracticeSnapshotStorePort,
  TypingEntityKind
} from '../../../typing';

export class ManualTypingClock implements ClockPort {
  constructor(
    private wallTime: number,
    private monotonicTime: number
  ) {}

  wallNow(): number {
    return this.wallTime;
  }

  monotonicNow(): number {
    return this.monotonicTime;
  }

  advance(milliseconds: number): void {
    this.wallTime += milliseconds;
    this.monotonicTime += milliseconds;
  }
}

export class SequenceTypingIdGenerator implements IdGeneratorPort {
  private readonly counters = new Map<TypingEntityKind, number>();

  constructor(private readonly prefix = 'typing') {}

  next(kind: TypingEntityKind): string {
    const value = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, value);
    return `${this.prefix}-${kind}-${value}`;
  }
}

export class InMemoryPracticeSnapshotStore implements PracticeSnapshotStorePort {
  private readonly values = new Map<string, PracticeSnapshot>();

  async get(snapshotId: string): Promise<PracticeSnapshot | undefined> {
    return clone(this.values.get(snapshotId));
  }

  async save(snapshot: PracticeSnapshot): Promise<void> {
    this.values.set(snapshot.id, clone(snapshot));
  }
}

export class InMemoryPracticeSessionStore implements PracticeSessionStorePort {
  private readonly values = new Map<string, PracticeSessionState>();

  async get(sessionId: string): Promise<PracticeSessionState | undefined> {
    return clone(this.values.get(sessionId));
  }

  async save(session: PracticeSessionState): Promise<void> {
    this.values.set(session.id, clone(session));
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}
