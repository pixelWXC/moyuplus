import type {
  CompletionConstraint,
  ContentProfile
} from '../content';
import type {
  EvaluationPolicy,
  TextPolicy
} from '../policies';
import type { CorrectionCounts } from '../session';

export type PracticeOutcome = 'completed' | 'timedOut' | 'abandoned' | 'restarted';

export interface PracticeMetrics {
  totalAttempts: number;
  correctAttempts: number;
  errorAttempts: number;
  completedUnits: number;
  printableAttempts: number;
  completedPrintableUnits: number;
  completedHanzi: number;
  completedEnglishCharacters: number;
  completedEnglishWords: number;
  accuracy: number;
  rawCpm: number;
  effectiveCpm: number;
  hanziPerMinute: number;
  standardWpm: number;
  completeWordsPerMinute: number;
  longestCorrectStreak: number;
  correctionCounts: CorrectionCounts;
}

export interface SpeedBucket {
  wallStartedAt: number;
  activeElapsedMs: number;
  rawCpm: number;
  effectiveCpm: number;
  accuracy: number;
  correctAttempts: number;
  errorAttempts: number;
  backspaces: number;
  otherCorrections: number;
}

export interface ErrorPairAggregate {
  expected: string;
  actual: string;
  count: number;
}

export interface ErrorWordAggregate {
  word: string;
  count: number;
}

export interface MasteryObservation {
  key: string;
  kind: 'grapheme' | 'word' | 'codeToken';
  wrongCount: number;
  reinforcementCorrectCount: number;
}

export interface PracticeResult {
  schemaVersion: number;
  id: string;
  sessionId: string;
  attemptId: string;
  snapshotId: string;
  materialId?: string;
  sourceRevision: string;
  outcome: PracticeOutcome;
  contentProfile: ContentProfile;
  completion: CompletionConstraint;
  evaluation: EvaluationPolicy;
  textPolicy: TextPolicy;
  startedAt: number;
  endedAt: number;
  wallElapsedMs: number;
  activeElapsedMs: number;
  metrics: PracticeMetrics;
  speedBuckets: SpeedBucket[];
  errorPairs: ErrorPairAggregate[];
  errorWords: ErrorWordAggregate[];
  masteryObservations: MasteryObservation[];
  benchmarkKey: string;
}

export * from './PracticeAnalytics';
