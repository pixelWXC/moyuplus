import type { PracticeSnapshot } from '../domain/content';
import {
  completionTarget,
  type InputAttempt,
  type PracticeSessionState
} from '../domain/session';

export type PracticePanelUnitState =
  | 'correct'
  | 'blocked'
  | 'target'
  | 'remaining';

export interface PracticePanelSnapshotUnit {
  index: number;
  text: string;
  display: string;
  state: PracticePanelUnitState;
}

export interface PracticePanelSnapshot {
  sessionId: string;
  revision: number;
  status: PracticeSessionState['status'];
  targetIndex: number;
  totalUnits: number;
  showMetrics: boolean;
  metrics: {
    activeElapsedMs: number;
    currentCpm: number;
    accuracy: number;
    remaining:
      | {
        kind: 'time';
        remainingMs: number;
        totalMs: number;
      }
      | {
        kind: 'units';
        remainingUnits: number;
      };
  };
  blockedAttempt?: {
    attemptId: string;
    expected: string;
    actual: string;
  };
  window: {
    start: number;
    end: number;
    units: PracticePanelSnapshotUnit[];
  };
  startedAt?: number;
  updatedAt: number;
  endedAt?: number;
}

export interface PracticePanelSnapshotProjectorOptions {
  before?: number;
  after?: number;
}

export class PracticePanelSnapshotProjector {
  private readonly before: number;
  private readonly after: number;

  constructor(options: PracticePanelSnapshotProjectorOptions = {}) {
    this.before = Math.max(0, Math.trunc(options.before ?? 80));
    this.after = Math.max(0, Math.trunc(options.after ?? 160));
  }

  project(
    session: PracticeSessionState,
    snapshot: PracticeSnapshot,
    monotonicNow = session.startedAtMonotonic ?? 0
  ): PracticePanelSnapshot {
    if (session.snapshotId !== snapshot.id) {
      throw new Error('Practice panel snapshot does not match the session.');
    }
    const totalUnits = completionTarget(snapshot);
    const targetIndex = Math.min(session.targetIndex, totalUnits);
    const start = Math.max(0, targetIndex - this.before);
    const end = Math.min(totalUnits, targetIndex + this.after + 1);
    const blockedAttempt = currentBlockedAttempt(session);
    const measuredElapsedMs = activePracticeElapsedMs(session, monotonicNow);
    const activeElapsedMs = snapshot.plan.completion.kind === 'timed'
      ? Math.min(
        measuredElapsedMs,
        snapshot.plan.completion.seconds * 1_000
      )
      : measuredElapsedMs;
    const correctAttempts = session.inputAttempts.filter(attempt => attempt.correct);
    const completedPrintable = correctAttempts.filter(
      attempt => isPrintable(attempt.expected)
    ).length;
    const activeMinutes = activeElapsedMs / 60_000;
    return {
      sessionId: session.id,
      revision: session.revision,
      status: session.status,
      targetIndex,
      totalUnits,
      showMetrics: snapshot.plan.displayPolicy.showLiveMetrics,
      metrics: {
        activeElapsedMs,
        currentCpm: activeMinutes <= 0
          ? 0
          : completedPrintable / activeMinutes,
        accuracy: session.inputAttempts.length === 0
          ? 100
          : correctAttempts.length / session.inputAttempts.length * 100,
        remaining: snapshot.plan.completion.kind === 'timed'
          ? {
            kind: 'time',
            remainingMs: timedPracticeRemainingMs(
              session,
              snapshot,
              monotonicNow
            ),
            totalMs: snapshot.plan.completion.seconds * 1_000
          }
          : {
            kind: 'units',
            remainingUnits: Math.max(0, totalUnits - targetIndex)
          }
      },
      ...(blockedAttempt
        ? {
          blockedAttempt: {
            attemptId: blockedAttempt.attemptId,
            expected: blockedAttempt.expected,
            actual: blockedAttempt.actual
          }
        }
        : {}),
      window: {
        start,
        end,
        units: snapshot.targetUnits.slice(start, end).map(unit => ({
          index: unit.index,
          text: unit.value,
          display: unit.display,
          state: unitState(unit.index, targetIndex, blockedAttempt)
        }))
      },
      ...(session.startedAt === undefined ? {} : { startedAt: session.startedAt }),
      updatedAt: session.updatedAt,
      ...(session.endedAt === undefined ? {} : { endedAt: session.endedAt })
    };
  }
}

export function activePracticeElapsedMs(
  session: PracticeSessionState,
  monotonicNow: number
): number {
  if (session.startedAtMonotonic === undefined) return 0;
  let elapsed = Math.max(
    0,
    monotonicNow
      - session.startedAtMonotonic
      - (session.accumulatedPausedMs ?? 0)
  );
  if (session.pausedAtMonotonic !== undefined) {
    elapsed = Math.max(
      0,
      elapsed - Math.max(0, monotonicNow - session.pausedAtMonotonic)
    );
  }
  return elapsed;
}

export function timedPracticeRemainingMs(
  session: PracticeSessionState,
  snapshot: PracticeSnapshot,
  monotonicNow: number
): number {
  if (snapshot.plan.completion.kind !== 'timed') {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(
    0,
    snapshot.plan.completion.seconds * 1_000
      - activePracticeElapsedMs(session, monotonicNow)
  );
}

function currentBlockedAttempt(
  session: PracticeSessionState
): InputAttempt | undefined {
  if (session.status !== 'blockedOnError') return undefined;
  return [...session.inputAttempts].reverse().find(attempt =>
    !attempt.correct && attempt.targetIndex === session.targetIndex
  );
}

function unitState(
  index: number,
  targetIndex: number,
  blockedAttempt: InputAttempt | undefined
): PracticePanelUnitState {
  if (index < targetIndex) return 'correct';
  if (index === targetIndex && blockedAttempt) return 'blocked';
  if (index === targetIndex) return 'target';
  return 'remaining';
}

function isPrintable(value: string): boolean {
  return value.length > 0 && !/^[\r\n\t]$/u.test(value);
}
