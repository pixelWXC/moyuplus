import type { PracticeResult } from '../../domain/analytics';
import type { PracticeSnapshot } from '../../domain/content';
import type { PracticeSessionState } from '../../domain/session';
import type { PracticeSessionLeaseConflict } from '../ports';

export type PracticeApplicationEvent =
  | { type: 'practicePrepared'; snapshot: PracticeSnapshot }
  | {
    type: 'practiceStartBlocked';
    activeSession: PracticeSessionLeaseConflict;
  }
  | { type: 'practiceStarted'; session: PracticeSessionState }
  | { type: 'practicePaused'; session: PracticeSessionState }
  | { type: 'practiceResumed'; session: PracticeSessionState }
  | {
    type: 'practiceRestarted';
    previousSession: PracticeSessionState;
    session: PracticeSessionState;
    result?: PracticeResult;
  }
  | {
    type: 'practiceFinished';
    session: PracticeSessionState;
    result?: PracticeResult;
  }
  | {
    type: 'practiceInputEvaluated';
    session: PracticeSessionState;
    result?: PracticeResult;
  }
  | {
    type: 'practiceCorrectionApplied';
    session: PracticeSessionState;
  };
