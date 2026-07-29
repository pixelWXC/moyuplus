import type {
  PracticeOutcome,
  PracticeResult
} from '../../domain/analytics';
import type {
  ContentRecipe,
  PracticePlan,
  PracticeSnapshot,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import type {
  CorrectionCounts,
  InputAttemptOrigin,
  PracticeSessionState,
  PracticeSessionStatus
} from '../../domain/session';
import type { PracticeApplicationEvent } from '../events';

export type TypingEntityKind =
  | 'snapshot'
  | 'session'
  | 'attempt'
  | 'inputAttempt'
  | 'result'
  | 'material';

export interface ClockPort {
  wallNow(): number;
  monotonicNow(): number;
}

export interface IdGeneratorPort {
  next(kind: TypingEntityKind): string;
}

export interface ContentPreparationPort {
  prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent>;
}

export interface PracticeSnapshotBuilderPort {
  build(input: {
    id: string;
    createdAt: number;
    plan: PracticePlan;
    prepared: PreparedContent;
  }): PracticeSnapshot;
}

export interface PracticeSnapshotStorePort {
  get(snapshotId: string): Promise<PracticeSnapshot | undefined>;
  save(snapshot: PracticeSnapshot): Promise<void>;
}

export interface PracticeSessionStorePort {
  get(sessionId: string): Promise<PracticeSessionState | undefined>;
  save(session: PracticeSessionState): Promise<void>;
}

export interface RestartPracticeTransition {
  previousSession: PracticeSessionState;
  nextSession: PracticeSessionState;
  result?: PracticeResult;
}

export interface FinishPracticeTransition {
  session: PracticeSessionState;
  result?: PracticeResult;
}

export interface PracticeSessionRuntimePort {
  start(input: {
    sessionId: string;
    attemptId: string;
    snapshot: PracticeSnapshot;
    wallTime: number;
    monotonicTime: number;
    targetIndex?: number;
  }): PracticeSessionState;
  pause(session: PracticeSessionState, monotonicTime: number): PracticeSessionState;
  resume(session: PracticeSessionState, monotonicTime: number): PracticeSessionState;
  input(input: {
    session: PracticeSessionState;
    snapshot: PracticeSnapshot;
    text: string;
    origin: InputAttemptOrigin;
    wallTime: number;
    nextAttemptId(): string;
  }): PracticeSessionState;
  correct(input: {
    session: PracticeSessionState;
    kind: keyof CorrectionCounts;
    count?: number;
    wallTime: number;
  }): PracticeSessionState;
  restart(input: {
    session: PracticeSessionState;
    snapshot: PracticeSnapshot;
    nextSessionId: string;
    nextAttemptId: string;
    resultId: string;
    wallTime: number;
    monotonicTime: number;
  }): RestartPracticeTransition;
  finish(input: {
    session: PracticeSessionState;
    snapshot: PracticeSnapshot;
    resultId: string;
    outcome: PracticeOutcome;
    wallTime: number;
    monotonicTime: number;
  }): FinishPracticeTransition;
}

export interface PracticeResultCommitPort {
  commit(result: PracticeResult): Promise<void>;
}

type ActivePracticeSessionStatus = Extract<
  PracticeSessionStatus,
  'ready' | 'running' | 'blockedOnError' | 'paused'
>;

export interface PracticeSessionLeaseConflict {
  id: string;
  status: ActivePracticeSessionStatus;
}

export type PracticeSessionLeaseAcquireResult =
  | { acquired: true }
  | {
    acquired: false;
    activeSession: PracticeSessionLeaseConflict;
  };

export interface PracticeSessionLeasePort {
  acquire(sessionId: string): Promise<PracticeSessionLeaseAcquireResult>;
  transition(
    currentSessionId: string,
    nextSessionId: string
  ): Promise<void>;
  release(sessionId: string): Promise<void>;
}

export interface PracticePanelPort {
  open(snapshot: PracticeSnapshot, session: PracticeSessionState): Promise<void>;
  render(session: PracticeSessionState): Promise<void>;
  complete(session: PracticeSessionState, result?: PracticeResult): Promise<void>;
}

export interface PracticeEventSinkPort {
  publish(event: PracticeApplicationEvent): void | Promise<void>;
}

export interface PracticeApplicationPorts {
  clock: ClockPort;
  ids: IdGeneratorPort;
  content: ContentPreparationPort;
  snapshotBuilder: PracticeSnapshotBuilderPort;
  snapshots: PracticeSnapshotStorePort;
  sessions: PracticeSessionStorePort;
  runtime: PracticeSessionRuntimePort;
  results: PracticeResultCommitPort;
  lease: PracticeSessionLeasePort;
  panel: PracticePanelPort;
  events: PracticeEventSinkPort;
}
