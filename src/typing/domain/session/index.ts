export type PracticeSessionStatus =
  | 'preparing'
  | 'ready'
  | 'running'
  | 'blockedOnError'
  | 'paused'
  | 'completed'
  | 'abandoned';

export type PracticeInputOrigin = 'direct' | 'composition' | 'paste';
export type InputAttemptOrigin = PracticeInputOrigin;

export type PracticeTransactionOutcome = 'applied' | 'blocked' | 'completed';

export interface PracticeTransactionReceipt {
  transactionId: string;
  inputDigest: string;
  baseRevision: number;
  revision: number;
  outcome: PracticeTransactionOutcome;
  consumedText: string;
  unconsumedText: string;
}

export interface InputAttempt {
  attemptId: string;
  targetIndex: number;
  expected: string;
  actual: string;
  normalizedExpected: string;
  normalizedActual: string;
  correct: boolean;
  timestamp: number;
  origin: InputAttemptOrigin;
}

export interface CorrectionCounts {
  backspace: number;
  delete: number;
  undo: number;
  redo: number;
  selectionDelete: number;
  other: number;
}

export interface PracticePauseInterval {
  startedAtMonotonic: number;
  endedAtMonotonic?: number;
}

export interface PracticeCorrectionEvent {
  kind: keyof CorrectionCounts;
  count: number;
  timestamp: number;
}

export interface PracticeSessionState {
  schemaVersion: number;
  id: string;
  snapshotId: string;
  attemptId: string;
  status: PracticeSessionStatus;
  revision: number;
  transactionReceipts: Record<string, PracticeTransactionReceipt>;
  targetIndex: number;
  startTargetIndex?: number;
  blockedInputCount: number;
  inputAttempts: InputAttempt[];
  currentCorrectStreak: number;
  longestCorrectStreak: number;
  correctionCounts: CorrectionCounts;
  correctionEvents: PracticeCorrectionEvent[];
  pauseIntervals: PracticePauseInterval[];
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  startedAtMonotonic?: number;
  endedAt?: number;
  pausedAtMonotonic?: number;
  accumulatedPausedMs?: number;
}

export interface PracticeCheckpoint {
  schemaVersion: number;
  session: PracticeSessionState;
  acceptedTextByLine: string[];
  blockedText?: string;
  lastStableDocumentVersion?: number;
  savedAt: number;
}

export * from './PracticeSessionEngine';
export * from './PracticeTransactionEngine';
