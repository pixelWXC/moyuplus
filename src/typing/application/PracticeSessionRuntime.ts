import {
  buildPracticeResult,
  type PracticeOutcome,
  type PracticeResult
} from '../domain/analytics';
import type { PracticeSnapshot } from '../domain/content';
import {
  PracticeSessionEngine,
  type PracticeSessionState
} from '../domain/session';
import type {
  FinishPracticeTransition,
  PracticeSessionRuntimePort,
  RestartPracticeTransition
} from './ports';

export class PracticeSessionRuntime implements PracticeSessionRuntimePort {
  constructor(private readonly engine = new PracticeSessionEngine()) {}

  start(input: Parameters<PracticeSessionRuntimePort['start']>[0]): PracticeSessionState {
    return this.engine.start(input);
  }

  pause(session: PracticeSessionState, monotonicTime: number): PracticeSessionState {
    return this.engine.pause(session, monotonicTime);
  }

  resume(session: PracticeSessionState, monotonicTime: number): PracticeSessionState {
    return this.engine.resume(session, monotonicTime);
  }

  input(input: Parameters<PracticeSessionRuntimePort['input']>[0]): PracticeSessionState {
    return this.engine.input(input);
  }

  correct(input: Parameters<PracticeSessionRuntimePort['correct']>[0]): PracticeSessionState {
    return this.engine.correct(input);
  }

  restart(
    input: Parameters<PracticeSessionRuntimePort['restart']>[0]
  ): RestartPracticeTransition {
    const result = this.resultIfAttempted({
      resultId: input.resultId,
      session: input.session,
      snapshot: input.snapshot,
      outcome: 'restarted',
      wallTime: input.wallTime,
      monotonicTime: input.monotonicTime
    });
    const previousSession: PracticeSessionState = {
      ...structuredClone(input.session),
      status: 'abandoned',
      endedAt: input.wallTime,
      updatedAt: input.wallTime
    };
    const nextSession = this.engine.start({
      sessionId: input.nextSessionId,
      attemptId: input.nextAttemptId,
      snapshot: input.snapshot,
      wallTime: input.wallTime,
      monotonicTime: input.monotonicTime
    });
    return { previousSession, nextSession, result };
  }

  finish(
    input: Parameters<PracticeSessionRuntimePort['finish']>[0]
  ): FinishPracticeTransition {
    const session: PracticeSessionState = {
      ...structuredClone(input.session),
      status: input.outcome === 'completed' || input.outcome === 'timedOut'
        ? 'completed'
        : 'abandoned',
      endedAt: input.wallTime,
      updatedAt: input.wallTime
    };
    return {
      session,
      result: this.resultIfAttempted({
        resultId: input.resultId,
        session,
        snapshot: input.snapshot,
        outcome: input.outcome,
        wallTime: input.wallTime,
        monotonicTime: input.monotonicTime
      })
    };
  }

  private resultIfAttempted(input: {
    resultId: string;
    session: PracticeSessionState;
    snapshot: PracticeSnapshot;
    outcome: PracticeOutcome;
    wallTime: number;
    monotonicTime: number;
  }): PracticeResult | undefined {
    if (input.session.inputAttempts.length === 0) {
      return undefined;
    }
    return buildPracticeResult({
      id: input.resultId,
      session: input.session,
      snapshot: input.snapshot,
      outcome: input.outcome,
      wallTime: input.wallTime,
      monotonicTime: input.monotonicTime
    });
  }
}
