import type { PracticeSnapshot } from '../domain/content';
import type { InputAttempt, PracticeSessionState } from '../domain/session';

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
    snapshot: PracticeSnapshot
  ): PracticePanelSnapshot {
    if (session.snapshotId !== snapshot.id) {
      throw new Error('Practice panel snapshot does not match the session.');
    }
    const targetIndex = Math.min(session.targetIndex, snapshot.targetUnits.length);
    const start = Math.max(0, targetIndex - this.before);
    const end = Math.min(snapshot.targetUnits.length, targetIndex + this.after + 1);
    const blockedAttempt = currentBlockedAttempt(session);
    return {
      sessionId: session.id,
      revision: session.revision,
      status: session.status,
      targetIndex,
      totalUnits: snapshot.targetUnits.length,
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
