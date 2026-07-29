import type {
  PracticePlan,
  SourceRange
} from '../../domain/content';
import type { PracticeOutcome } from '../../domain/analytics';
import type {
  CorrectionCounts,
  InputAttemptOrigin
} from '../../domain/session';

export interface PreparePracticeCommand {
  type: 'prepare';
  plan: PracticePlan;
  range: SourceRange;
}

export interface StartPracticeCommand {
  type: 'start';
  snapshotId: string;
  targetIndex?: number;
}

export interface PausePracticeCommand {
  type: 'pause';
  sessionId: string;
}

export interface ResumePracticeCommand {
  type: 'resume';
  sessionId: string;
}

export interface RestartPracticeCommand {
  type: 'restart';
  sessionId: string;
}

export interface FinishPracticeCommand {
  type: 'finish';
  sessionId: string;
  outcome: PracticeOutcome;
}

export interface InputPracticeCommand {
  type: 'input';
  sessionId: string;
  text: string;
  origin: InputAttemptOrigin;
}

export interface CorrectPracticeCommand {
  type: 'correct';
  sessionId: string;
  kind: keyof CorrectionCounts;
  count?: number;
}

export type PracticeApplicationCommand =
  | PreparePracticeCommand
  | StartPracticeCommand
  | PausePracticeCommand
  | ResumePracticeCommand
  | RestartPracticeCommand
  | FinishPracticeCommand
  | InputPracticeCommand
  | CorrectPracticeCommand;
