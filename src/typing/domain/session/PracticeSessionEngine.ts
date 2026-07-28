import { TYPING_SCHEMA_VERSION, type PracticeSnapshot } from '../content';
import type { TextPolicy } from '../policies';
import type {
  CorrectionCounts,
  InputAttempt,
  InputAttemptOrigin,
  PracticeSessionState
} from './index';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export interface StartPracticeSessionInput {
  sessionId: string;
  attemptId: string;
  snapshot: PracticeSnapshot;
  wallTime: number;
  monotonicTime: number;
}

export interface ApplyPracticeInput {
  session: PracticeSessionState;
  snapshot: PracticeSnapshot;
  text: string;
  origin: InputAttemptOrigin;
  wallTime: number;
  nextAttemptId(): string;
}

export interface ApplyPracticeCorrection {
  session: PracticeSessionState;
  kind: keyof CorrectionCounts;
  count?: number;
  wallTime: number;
}

export class PracticeSessionEngine {
  start(input: StartPracticeSessionInput): PracticeSessionState {
    return {
      schemaVersion: TYPING_SCHEMA_VERSION,
      id: input.sessionId,
      snapshotId: input.snapshot.id,
      attemptId: input.attemptId,
      status: 'running',
      revision: 0,
      transactionReceipts: {},
      targetIndex: 0,
      blockedInputCount: 0,
      inputAttempts: [],
      currentCorrectStreak: 0,
      longestCorrectStreak: 0,
      correctionCounts: {
        backspace: 0,
        delete: 0,
        undo: 0,
        redo: 0,
        selectionDelete: 0,
        other: 0
      },
      correctionEvents: [],
      pauseIntervals: [],
      createdAt: input.wallTime,
      updatedAt: input.wallTime,
      startedAt: input.wallTime,
      startedAtMonotonic: input.monotonicTime,
      accumulatedPausedMs: 0
    };
  }

  pause(session: PracticeSessionState, monotonicTime: number): PracticeSessionState {
    if (session.status !== 'running' && session.status !== 'blockedOnError') {
      throw new Error(`Practice pause is not allowed while session is ${session.status}.`);
    }
    if (session.startedAtMonotonic !== undefined && monotonicTime < session.startedAtMonotonic) {
      throw new Error('Practice monotonic time cannot move backwards.');
    }
    const paused = structuredClone(session);
    paused.status = 'paused';
    paused.pausedAtMonotonic = monotonicTime;
    paused.pauseIntervals.push({ startedAtMonotonic: monotonicTime });
    return paused;
  }

  resume(session: PracticeSessionState, monotonicTime: number): PracticeSessionState {
    if (session.status !== 'paused' || session.pausedAtMonotonic === undefined) {
      throw new Error(`Practice resume is not allowed while session is ${session.status}.`);
    }
    const pausedAtMonotonic = session.pausedAtMonotonic;
    if (monotonicTime < pausedAtMonotonic) {
      throw new Error('Practice monotonic time cannot move backwards.');
    }
    const resumed = structuredClone(session);
    resumed.status = resumed.blockedInputCount > 0 ? 'blockedOnError' : 'running';
    resumed.accumulatedPausedMs = (resumed.accumulatedPausedMs ?? 0)
      + (monotonicTime - pausedAtMonotonic);
    const openInterval = resumed.pauseIntervals[resumed.pauseIntervals.length - 1];
    if (!openInterval || openInterval.endedAtMonotonic !== undefined) {
      throw new Error('Practice pause history is inconsistent.');
    }
    openInterval.endedAtMonotonic = monotonicTime;
    delete resumed.pausedAtMonotonic;
    return resumed;
  }

  input(input: ApplyPracticeInput): PracticeSessionState {
    if (input.session.status !== 'running' && input.session.status !== 'blockedOnError') {
      throw new Error(`Practice input is not allowed while session is ${input.session.status}.`);
    }
    if (input.session.snapshotId !== input.snapshot.id) {
      throw new Error('Practice session snapshot does not match the supplied snapshot.');
    }

    // A live session is the authoritative mutable runtime state. Copying its
    // append-only attempt history here makes every keystroke O(history), which
    // violates the input-path budget. Immutable PracticeSnapshot data remains
    // separate and is never mutated by the engine.
    const session = input.session;
    const targetLimit = completionTarget(input.snapshot);
    advanceIgnoredTargets(session, input.snapshot);
    for (const actual of segmentPracticeGraphemes(input.text)) {
      advanceIgnoredTargets(session, input.snapshot);
      if (session.targetIndex >= targetLimit) {
        break;
      }
      const target = input.snapshot.targetUnits[session.targetIndex];
      if (!target) {
        break;
      }
      const normalizedExpected = normalizePracticeGrapheme(
        target.value,
        input.snapshot.plan.textPolicy
      );
      const normalizedActual = normalizePracticeGrapheme(
        actual,
        input.snapshot.plan.textPolicy
      );
      const correct = session.status !== 'blockedOnError'
        && normalizedExpected === normalizedActual;
      const attempt: InputAttempt = {
        attemptId: input.nextAttemptId(),
        targetIndex: session.targetIndex,
        expected: target.value,
        actual,
        normalizedExpected,
        normalizedActual,
        correct,
        timestamp: input.wallTime,
        origin: input.origin
      };
      session.inputAttempts.push(attempt);
      if (correct) {
        session.targetIndex += 1;
        if (
          input.snapshot.plan.textPolicy.whitespace.mode === 'collapse'
          && target.kind !== 'grapheme'
        ) {
          while (
            session.targetIndex < input.snapshot.targetUnits.length
            && input.snapshot.targetUnits[session.targetIndex].kind !== 'grapheme'
          ) {
            session.targetIndex += 1;
          }
        }
        session.currentCorrectStreak += 1;
        session.longestCorrectStreak = Math.max(
          session.longestCorrectStreak,
          session.currentCorrectStreak
        );
      } else {
        session.currentCorrectStreak = 0;
        if (input.snapshot.plan.evaluation.errorPolicy === 'block') {
          session.status = 'blockedOnError';
          session.blockedInputCount += 1;
        } else {
          session.targetIndex += 1;
        }
      }
    }
    advanceIgnoredTargets(session, input.snapshot);

    session.updatedAt = input.wallTime;
    if (session.targetIndex >= targetLimit) {
      session.status = 'completed';
      session.endedAt = input.wallTime;
    }
    return session;
  }

  correct(input: ApplyPracticeCorrection): PracticeSessionState {
    if (input.session.status !== 'running' && input.session.status !== 'blockedOnError') {
      throw new Error(`Practice correction is not allowed while session is ${input.session.status}.`);
    }
    const count = Math.trunc(input.count ?? 1);
    if (count <= 0) {
      throw new Error('Practice correction count must be positive.');
    }
    const session = input.session;
    session.correctionCounts[input.kind] += count;
    session.correctionEvents.push({
      kind: input.kind,
      count,
      timestamp: input.wallTime
    });
    if (input.kind === 'backspace' && session.blockedInputCount > 0) {
      session.blockedInputCount = Math.max(0, session.blockedInputCount - count);
      if (session.blockedInputCount === 0) {
        session.status = 'running';
      }
    }
    session.updatedAt = input.wallTime;
    return session;
  }
}

export function completionTarget(snapshot: PracticeSnapshot): number {
  if (snapshot.plan.completion.kind !== 'length') {
    return snapshot.targetUnits.length;
  }
  return Math.min(
    snapshot.targetUnits.length,
    Math.max(0, Math.trunc(snapshot.plan.completion.targetUnits))
  );
}

export function segmentPracticeGraphemes(text: string): string[] {
  return [...graphemeSegmenter.segment(text)].map(segment => segment.segment);
}

function advanceIgnoredTargets(
  session: PracticeSessionState,
  snapshot: PracticeSnapshot
): void {
  session.targetIndex = advanceIgnoredTargetIndex(
    snapshot,
    session.targetIndex
  );
}

export function advanceIgnoredTargetIndex(
  snapshot: PracticeSnapshot,
  startIndex: number
): number {
  let targetIndex = startIndex;
  while (targetIndex < snapshot.targetUnits.length) {
    const target = snapshot.targetUnits[targetIndex];
    const ignoredWhitespace = snapshot.plan.textPolicy.whitespace.mode === 'ignore'
      && target.kind !== 'grapheme';
    const trimmedLineEdge = snapshot.plan.textPolicy.whitespace.mode === 'trimLineEdges'
      && isLineEdgeWhitespace(snapshot, targetIndex);
    const automaticLineBreak = snapshot.plan.flowPolicy.lineAdvance === 'automatic'
      && target.kind === 'lineBreak';
    if (!ignoredWhitespace && !trimmedLineEdge && !automaticLineBreak) {
      break;
    }
    targetIndex += 1;
  }
  return targetIndex;
}

function isLineEdgeWhitespace(snapshot: PracticeSnapshot, index: number): boolean {
  const target = snapshot.targetUnits[index];
  if (target.kind !== 'space' && target.kind !== 'tab') {
    return false;
  }
  let hasGraphemeBefore = false;
  let hasGraphemeAfter = false;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = snapshot.targetUnits[cursor];
    if (candidate.lineIndex !== target.lineIndex) break;
    if (candidate.kind === 'grapheme') {
      hasGraphemeBefore = true;
      break;
    }
  }
  for (let cursor = index + 1; cursor < snapshot.targetUnits.length; cursor += 1) {
    const candidate = snapshot.targetUnits[cursor];
    if (candidate.lineIndex !== target.lineIndex) break;
    if (candidate.kind === 'grapheme') {
      hasGraphemeAfter = true;
      break;
    }
  }
  return !hasGraphemeBefore || !hasGraphemeAfter;
}

const ZH_PUNCTUATION_EQUIVALENTS = new Map<string, string>([
  [',', '，'],
  ['.', '。'],
  [':', '：'],
  [';', '；'],
  ['?', '？'],
  ['!', '！'],
  ['(', '（'],
  [')', '）'],
  ['[', '【'],
  [']', '】'],
  ['"', '“'],
  ["'", '‘']
]);

export function normalizePracticeGrapheme(value: string, policy: TextPolicy): string {
  let normalized = value.normalize('NFC');
  if (policy.whitespace.mode === 'collapse' && /^\s+$/u.test(normalized)) {
    normalized = ' ';
  }
  if (
    policy.punctuation.mode === 'equivalent'
    && policy.punctuation.mappingVersion === 'zh-punctuation-v1'
  ) {
    normalized = ZH_PUNCTUATION_EQUIVALENTS.get(normalized) ?? normalized;
  }
  return policy.caseSensitive ? normalized : normalized.toLocaleLowerCase();
}
