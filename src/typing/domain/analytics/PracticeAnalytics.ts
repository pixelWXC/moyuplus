import { TYPING_SCHEMA_VERSION, type PracticeSnapshot } from '../content';
import type { PracticeSessionState } from '../session';
import type {
  ErrorPairAggregate,
  ErrorWordAggregate,
  MasteryObservation,
  PracticeMetrics,
  PracticeOutcome,
  PracticeResult,
  SpeedBucket
} from './index';

export interface BuildPracticeResultInput {
  id: string;
  session: PracticeSessionState;
  snapshot: PracticeSnapshot;
  outcome: PracticeOutcome;
  wallTime: number;
  monotonicTime: number;
}

export function buildPracticeResult(input: BuildPracticeResultInput): PracticeResult {
  if (input.session.snapshotId !== input.snapshot.id) {
    throw new Error('Practice result snapshot does not match the session.');
  }
  if (
    input.session.startedAt === undefined
    || input.session.startedAtMonotonic === undefined
  ) {
    throw new Error('Practice result requires a started session.');
  }

  const attempts = input.session.inputAttempts;
  const correctAttempts = attempts.filter(attempt => attempt.correct);
  const activeElapsedMs = calculateActiveElapsed(input);
  const activeMinutes = activeElapsedMs / 60_000;
  const printableAttempts = attempts.filter(attempt => isPrintable(attempt.actual)).length;
  const completedPrintableUnits = correctAttempts
    .filter(attempt => isPrintable(attempt.expected))
    .length;
  const completedHanzi = correctAttempts
    .filter(attempt => /\p{Script=Han}/u.test(attempt.expected))
    .length;
  const completedEnglishCharacters = correctAttempts
    .filter(attempt => /[\p{Script=Latin}\s]/u.test(attempt.expected))
    .length;
  const completedEnglishWords = countCompleteEnglishWords(
    correctAttempts.map(attempt => attempt.expected).join('')
  );
  const metrics: PracticeMetrics = {
    totalAttempts: attempts.length,
    correctAttempts: correctAttempts.length,
    errorAttempts: attempts.length - correctAttempts.length,
    completedUnits: Math.max(
      0,
      input.session.targetIndex - (input.session.startTargetIndex ?? 0)
    ),
    printableAttempts,
    completedPrintableUnits,
    completedHanzi,
    completedEnglishCharacters,
    completedEnglishWords,
    accuracy: percentage(correctAttempts.length, attempts.length),
    rawCpm: perMinute(printableAttempts, activeMinutes),
    effectiveCpm: perMinute(completedPrintableUnits, activeMinutes),
    hanziPerMinute: perMinute(completedHanzi, activeMinutes),
    standardWpm: perMinute(completedEnglishCharacters / 5, activeMinutes),
    completeWordsPerMinute: perMinute(completedEnglishWords, activeMinutes),
    longestCorrectStreak: input.session.longestCorrectStreak,
    correctionCounts: structuredClone(input.session.correctionCounts)
  };

  return deepFreeze({
    schemaVersion: TYPING_SCHEMA_VERSION,
    id: input.id,
    sessionId: input.session.id,
    attemptId: input.session.attemptId,
    snapshotId: input.snapshot.id,
    materialId: input.snapshot.materialId,
    sourceRevision: input.snapshot.sourceRevision,
    outcome: input.outcome,
    contentProfile: structuredClone(input.snapshot.contentProfile),
    completion: structuredClone(input.snapshot.plan.completion),
    evaluation: structuredClone(input.snapshot.plan.evaluation),
    textPolicy: structuredClone(input.snapshot.plan.textPolicy),
    startedAt: input.session.startedAt,
    endedAt: input.wallTime,
    wallElapsedMs: Math.max(0, input.wallTime - input.session.startedAt),
    activeElapsedMs,
    metrics,
    speedBuckets: buildSpeedBuckets(input),
    errorPairs: aggregateErrorPairs(input.session),
    errorWords: aggregateErrorWords(input.session, input.snapshot),
    masteryObservations: buildMasteryObservations(input.session, input.snapshot),
    benchmarkKey: createBenchmarkKey(input.snapshot)
  });
}

function buildMasteryObservations(
  session: PracticeSessionState,
  snapshot: PracticeSnapshot
): MasteryObservation[] {
  if (snapshot.contentProfile.kind === 'mastery') {
    return buildReinforcementObservations(session, snapshot);
  }
  const values = new Map<string, MasteryObservation>();
  for (const attempt of session.inputAttempts) {
    const target = snapshot.targetUnits[attempt.targetIndex];
    if (!target) continue;
    const primaryKind = snapshot.contentProfile.kind === 'code'
      ? 'codeToken'
      : 'grapheme';
    addMasteryObservation(values, {
      key: target.wordKey && primaryKind === 'codeToken' ? target.wordKey : target.value,
      kind: primaryKind,
      wrong: !attempt.correct,
      reinforcementCorrect: false
    });
    if (target.wordKey && primaryKind === 'grapheme' && !attempt.correct) {
      addMasteryObservation(values, {
        key: target.wordKey,
        kind: 'word',
        wrong: true,
        reinforcementCorrect: false
      });
    }
  }
  return [...values.values()]
    .filter(value => value.wrongCount > 0 || value.reinforcementCorrectCount > 0)
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key));
}

function buildReinforcementObservations(
  session: PracticeSessionState,
  snapshot: PracticeSnapshot
): MasteryObservation[] {
  const targets = new Map<string, Set<number>>();
  for (const target of snapshot.targetUnits) {
    if (!target.wordKey || target.kind !== 'grapheme') continue;
    const indexes = targets.get(target.wordKey) ?? new Set<number>();
    indexes.add(target.index);
    targets.set(target.wordKey, indexes);
  }

  const attempts = new Map<string, {
    correctIndexes: Set<number>;
    wrongCount: number;
  }>();
  for (const attempt of session.inputAttempts) {
    const target = snapshot.targetUnits[attempt.targetIndex];
    if (!target?.wordKey || target.kind !== 'grapheme') continue;
    const state = attempts.get(target.wordKey) ?? {
      correctIndexes: new Set<number>(),
      wrongCount: 0
    };
    if (attempt.correct) {
      state.correctIndexes.add(target.index);
    } else {
      state.wrongCount += 1;
    }
    attempts.set(target.wordKey, state);
  }

  const kind = snapshot.contentProfile.kind === 'mastery'
    && snapshot.contentProfile.category === 'codeToken'
    ? 'codeToken'
    : 'word';
  const observations: MasteryObservation[] = [];
  for (const [key, state] of attempts) {
    const expectedIndexes = targets.get(key);
    const completed = expectedIndexes
      && [...expectedIndexes].every(index => state.correctIndexes.has(index));
    if (state.wrongCount > 0) {
      observations.push({
        key,
        kind,
        wrongCount: state.wrongCount,
        reinforcementCorrectCount: 0
      });
    } else if (completed) {
      observations.push({
        key,
        kind,
        wrongCount: 0,
        reinforcementCorrectCount: 1
      });
    }
  }
  return observations.sort((left, right) => left.key.localeCompare(right.key));
}

function addMasteryObservation(
  values: Map<string, MasteryObservation>,
  input: {
    key: string;
    kind: MasteryObservation['kind'];
    wrong: boolean;
    reinforcementCorrect: boolean;
  }
): void {
  const mapKey = `${input.kind}\u0000${input.key}`;
  const observation = values.get(mapKey) ?? {
    key: input.key,
    kind: input.kind,
    wrongCount: 0,
    reinforcementCorrectCount: 0
  };
  if (input.wrong) observation.wrongCount += 1;
  if (input.reinforcementCorrect) observation.reinforcementCorrectCount += 1;
  values.set(mapKey, observation);
}

const SPEED_BUCKET_MS = 10_000;

function buildSpeedBuckets(input: BuildPracticeResultInput): SpeedBucket[] {
  if (input.session.startedAt === undefined || input.session.startedAtMonotonic === undefined) {
    return [];
  }
  const wallElapsedMs = Math.max(0, input.wallTime - input.session.startedAt);
  const buckets: SpeedBucket[] = [];
  for (let offset = 0; offset < wallElapsedMs; offset += SPEED_BUCKET_MS) {
    const duration = Math.min(SPEED_BUCKET_MS, wallElapsedMs - offset);
    const wallStartedAt = input.session.startedAt + offset;
    const wallEndedAt = wallStartedAt + duration;
    const monotonicStartedAt = input.session.startedAtMonotonic + offset;
    const monotonicEndedAt = monotonicStartedAt + duration;
    const activeElapsedMs = Math.max(
      0,
      duration - pausedOverlap(input, monotonicStartedAt, monotonicEndedAt)
    );
    const isLastBucket = wallEndedAt === input.wallTime;
    const attempts = input.session.inputAttempts.filter(attempt =>
      attempt.timestamp >= wallStartedAt
      && (attempt.timestamp < wallEndedAt || (isLastBucket && attempt.timestamp === wallEndedAt))
    );
    const corrections = input.session.correctionEvents.filter(correction =>
      correction.timestamp >= wallStartedAt
      && (
        correction.timestamp < wallEndedAt
        || (isLastBucket && correction.timestamp === wallEndedAt)
      )
    );
    const correctAttempts = attempts.filter(attempt => attempt.correct);
    const printableAttempts = attempts.filter(attempt => isPrintable(attempt.actual)).length;
    const completedPrintableUnits = correctAttempts
      .filter(attempt => isPrintable(attempt.expected))
      .length;
    const activeMinutes = activeElapsedMs / 60_000;
    buckets.push({
      wallStartedAt,
      activeElapsedMs,
      rawCpm: perMinute(printableAttempts, activeMinutes),
      effectiveCpm: perMinute(completedPrintableUnits, activeMinutes),
      accuracy: percentage(correctAttempts.length, attempts.length),
      correctAttempts: correctAttempts.length,
      errorAttempts: attempts.length - correctAttempts.length,
      backspaces: corrections
        .filter(correction => correction.kind === 'backspace')
        .reduce((total, correction) => total + correction.count, 0),
      otherCorrections: corrections
        .filter(correction => correction.kind !== 'backspace')
        .reduce((total, correction) => total + correction.count, 0)
    });
  }
  return buckets;
}

function pausedOverlap(
  input: BuildPracticeResultInput,
  startedAt: number,
  endedAt: number
): number {
  let overlap = 0;
  for (const interval of input.session.pauseIntervals) {
    const intervalEnd = interval.endedAtMonotonic ?? input.monotonicTime;
    overlap += Math.max(
      0,
      Math.min(endedAt, intervalEnd) - Math.max(startedAt, interval.startedAtMonotonic)
    );
  }
  return overlap;
}

function calculateActiveElapsed(input: BuildPracticeResultInput): number {
  const openPauseMs = input.session.pausedAtMonotonic === undefined
    ? 0
    : Math.max(0, input.monotonicTime - input.session.pausedAtMonotonic);
  return Math.max(
    0,
    input.monotonicTime
      - (input.session.startedAtMonotonic ?? input.monotonicTime)
      - (input.session.accumulatedPausedMs ?? 0)
      - openPauseMs
  );
}

function aggregateErrorPairs(session: PracticeSessionState): ErrorPairAggregate[] {
  const counts = new Map<string, ErrorPairAggregate>();
  for (const attempt of session.inputAttempts) {
    if (attempt.correct) continue;
    const key = `${attempt.expected}\u0000${attempt.actual}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        expected: attempt.expected,
        actual: attempt.actual,
        count: 1
      });
    }
  }
  return [...counts.values()].sort(compareCountThenKey);
}

function aggregateErrorWords(
  session: PracticeSessionState,
  snapshot: PracticeSnapshot
): ErrorWordAggregate[] {
  const counts = new Map<string, number>();
  for (const attempt of session.inputAttempts) {
    if (attempt.correct) continue;
    const word = snapshot.targetUnits[attempt.targetIndex]?.wordKey;
    if (word) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort(compareCountThenKey);
}

function createBenchmarkKey(snapshot: PracticeSnapshot): string {
  const profile = JSON.stringify(snapshot.contentProfile);
  const completion = JSON.stringify(snapshot.plan.completion);
  const evaluation = snapshot.plan.evaluation.errorPolicy;
  const whitespace = snapshot.plan.textPolicy.whitespace.mode;
  const punctuation = `${snapshot.plan.textPolicy.punctuation.mode}:${snapshot.plan.textPolicy.punctuation.mappingVersion}`;
  return `${profile}|${completion}|${evaluation}|${whitespace}:${punctuation}`;
}

function isPrintable(value: string): boolean {
  return !/^\s+$/u.test(value);
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function perMinute(value: number, activeMinutes: number): number {
  return activeMinutes <= 0 ? 0 : value / activeMinutes;
}

function countCompleteEnglishWords(value: string): number {
  const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
  let count = 0;
  for (const segment of segmenter.segment(value)) {
    if (segment.isWordLike && /^\p{Script=Latin}+$/u.test(segment.segment)) {
      count += 1;
    }
  }
  return count;
}

function compareCountThenKey(
  left: { count: number; expected?: string; actual?: string; word?: string },
  right: { count: number; expected?: string; actual?: string; word?: string }
): number {
  return right.count - left.count
    || `${left.expected ?? left.word}\u0000${left.actual ?? ''}`
      .localeCompare(`${right.expected ?? right.word}\u0000${right.actual ?? ''}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
