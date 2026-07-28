import type { PracticeSnapshot } from '../content';
import type {
  InputAttempt,
  PracticeCorrectionEvent,
  PracticeInputOrigin,
  PracticeSessionState,
  PracticeSessionStatus,
  PracticeTransactionReceipt
} from './index';
import {
  advanceIgnoredTargetIndex,
  completionTarget,
  normalizePracticeGrapheme,
  segmentPracticeGraphemes
} from './PracticeSessionEngine';

export type PracticeInputTransaction =
  | {
    type: 'submit';
    transactionId: string;
    baseRevision: number;
    kind: PracticeInputOrigin;
    text: string;
  }
  | {
    type: 'correct';
    transactionId: string;
    baseRevision: number;
  };

export interface PracticeSessionDelta {
  transactionId: string;
  baseRevision: number;
  revision: number;
  status: PracticeSessionStatus;
  targetIndex: number;
  blockedInputCount: number;
  currentCorrectStreak: number;
  longestCorrectStreak: number;
  updatedAt: number;
  endedAt?: number;
  attemptAdditions: InputAttempt[];
  correctionAdditions: PracticeCorrectionEvent[];
  backspaceCorrectionCount: number;
  receipt: PracticeTransactionReceipt;
}

export type PracticeTransactionCalculation =
  | {
    kind: 'delta';
    delta: PracticeSessionDelta;
    receipt: PracticeTransactionReceipt;
  }
  | {
    kind: 'duplicate';
    receipt: PracticeTransactionReceipt;
  };

export interface CalculatePracticeTransactionInput {
  session: PracticeSessionState;
  snapshot: PracticeSnapshot;
  transaction: PracticeInputTransaction;
  wallTime: number;
  nextAttemptId(): string;
}

export class PracticeTransactionEngine {
  calculate(input: CalculatePracticeTransactionInput): PracticeTransactionCalculation {
    validateTransactionId(input.transaction.transactionId);
    const digest = transactionDigest(input.transaction);
    const duplicate = input.session.transactionReceipts[input.transaction.transactionId];
    if (duplicate) {
      if (duplicate.inputDigest !== digest) {
        throw new Error('Practice transaction id was reused with different input.');
      }
      return { kind: 'duplicate', receipt: structuredClone(duplicate) };
    }
    if (input.transaction.baseRevision !== input.session.revision) {
      throw new Error('Practice transaction base revision is stale.');
    }
    if (input.session.snapshotId !== input.snapshot.id) {
      throw new Error('Practice session snapshot does not match the supplied snapshot.');
    }
    return input.transaction.type === 'submit'
      ? this.calculateSubmit({
        ...input,
        transaction: input.transaction
      }, digest)
      : this.calculateCorrection({
        ...input,
        transaction: input.transaction
      }, digest);
  }

  applyDelta(session: PracticeSessionState, delta: PracticeSessionDelta): void {
    if (session.revision !== delta.baseRevision) {
      throw new Error('Practice delta base revision is stale.');
    }
    if (session.transactionReceipts[delta.transactionId]) {
      throw new Error('Practice delta transaction has already been applied.');
    }
    session.inputAttempts.push(...delta.attemptAdditions.map(value => structuredClone(value)));
    session.correctionEvents.push(
      ...delta.correctionAdditions.map(value => structuredClone(value))
    );
    session.correctionCounts.backspace += delta.backspaceCorrectionCount;
    session.status = delta.status;
    session.targetIndex = delta.targetIndex;
    session.blockedInputCount = delta.blockedInputCount;
    session.currentCorrectStreak = delta.currentCorrectStreak;
    session.longestCorrectStreak = delta.longestCorrectStreak;
    session.updatedAt = delta.updatedAt;
    if (delta.endedAt === undefined) {
      delete session.endedAt;
    } else {
      session.endedAt = delta.endedAt;
    }
    session.revision = delta.revision;
    session.transactionReceipts[delta.transactionId] = structuredClone(delta.receipt);
  }

  private calculateSubmit(
    input: CalculatePracticeTransactionInput & {
      transaction: Extract<PracticeInputTransaction, { type: 'submit' }>;
    },
    digest: string
  ): PracticeTransactionCalculation {
    if (input.session.status !== 'running') {
      throw new Error(
        `Practice submit is not allowed while session is ${input.session.status}.`
      );
    }
    const graphemes = segmentPracticeGraphemes(input.transaction.text);
    if (graphemes.length === 0) {
      throw new Error('Practice submit text must not be empty.');
    }

    const targetLimit = completionTarget(input.snapshot);
    const attemptAdditions: InputAttempt[] = [];
    let targetIndex = advanceIgnoredTargetIndex(input.snapshot, input.session.targetIndex);
    let status: PracticeSessionStatus = 'running';
    let blockedInputCount = input.session.blockedInputCount;
    let currentCorrectStreak = input.session.currentCorrectStreak;
    let longestCorrectStreak = input.session.longestCorrectStreak;
    let consumedCount = 0;

    for (const actual of graphemes) {
      targetIndex = advanceIgnoredTargetIndex(input.snapshot, targetIndex);
      if (targetIndex >= targetLimit) break;
      const target = input.snapshot.targetUnits[targetIndex];
      if (!target) break;
      const normalizedExpected = normalizePracticeGrapheme(
        target.value,
        input.snapshot.plan.textPolicy
      );
      const normalizedActual = normalizePracticeGrapheme(
        actual,
        input.snapshot.plan.textPolicy
      );
      const correct = normalizedExpected === normalizedActual;
      attemptAdditions.push({
        attemptId: input.nextAttemptId(),
        targetIndex,
        expected: target.value,
        actual,
        normalizedExpected,
        normalizedActual,
        correct,
        timestamp: input.wallTime,
        origin: input.transaction.kind
      });
      consumedCount += 1;
      if (correct) {
        targetIndex += 1;
        targetIndex = advanceCollapsedWhitespace(input.snapshot, targetIndex, target.kind);
        currentCorrectStreak += 1;
        longestCorrectStreak = Math.max(longestCorrectStreak, currentCorrectStreak);
        continue;
      }
      currentCorrectStreak = 0;
      if (input.snapshot.plan.evaluation.errorPolicy === 'block') {
        status = 'blockedOnError';
        blockedInputCount = 1;
        break;
      }
      targetIndex += 1;
    }

    targetIndex = advanceIgnoredTargetIndex(input.snapshot, targetIndex);
    if (status !== 'blockedOnError' && targetIndex >= targetLimit) {
      status = 'completed';
    }
    const consumedText = graphemes.slice(0, consumedCount).join('');
    const unconsumedText = graphemes.slice(consumedCount).join('');
    const revision = input.session.revision + 1;
    const outcome = status === 'blockedOnError'
      ? 'blocked'
      : status === 'completed'
        ? 'completed'
        : 'applied';
    const receipt: PracticeTransactionReceipt = {
      transactionId: input.transaction.transactionId,
      inputDigest: digest,
      baseRevision: input.session.revision,
      revision,
      outcome,
      consumedText,
      unconsumedText
    };
    const delta: PracticeSessionDelta = {
      transactionId: input.transaction.transactionId,
      baseRevision: input.session.revision,
      revision,
      status,
      targetIndex,
      blockedInputCount,
      currentCorrectStreak,
      longestCorrectStreak,
      updatedAt: input.wallTime,
      ...(status === 'completed' ? { endedAt: input.wallTime } : {}),
      attemptAdditions,
      correctionAdditions: [],
      backspaceCorrectionCount: 0,
      receipt
    };
    return { kind: 'delta', delta, receipt };
  }

  private calculateCorrection(
    input: CalculatePracticeTransactionInput & {
      transaction: Extract<PracticeInputTransaction, { type: 'correct' }>;
    },
    digest: string
  ): PracticeTransactionCalculation {
    if (
      input.session.status !== 'blockedOnError'
      || input.session.blockedInputCount <= 0
    ) {
      throw new Error('Practice correction requires an active blocked error.');
    }
    const revision = input.session.revision + 1;
    const receipt: PracticeTransactionReceipt = {
      transactionId: input.transaction.transactionId,
      inputDigest: digest,
      baseRevision: input.session.revision,
      revision,
      outcome: 'applied',
      consumedText: '',
      unconsumedText: ''
    };
    const delta: PracticeSessionDelta = {
      transactionId: input.transaction.transactionId,
      baseRevision: input.session.revision,
      revision,
      status: 'running',
      targetIndex: input.session.targetIndex,
      blockedInputCount: 0,
      currentCorrectStreak: input.session.currentCorrectStreak,
      longestCorrectStreak: input.session.longestCorrectStreak,
      updatedAt: input.wallTime,
      attemptAdditions: [],
      correctionAdditions: [{
        kind: 'backspace',
        count: 1,
        timestamp: input.wallTime
      }],
      backspaceCorrectionCount: 1,
      receipt
    };
    return { kind: 'delta', delta, receipt };
  }
}

function advanceCollapsedWhitespace(
  snapshot: PracticeSnapshot,
  targetIndex: number,
  consumedKind: PracticeSnapshot['targetUnits'][number]['kind']
): number {
  if (
    snapshot.plan.textPolicy.whitespace.mode !== 'collapse'
    || consumedKind === 'grapheme'
  ) {
    return targetIndex;
  }
  let next = targetIndex;
  while (
    next < snapshot.targetUnits.length
    && snapshot.targetUnits[next]?.kind !== 'grapheme'
  ) {
    next += 1;
  }
  return next;
}

function validateTransactionId(value: string): void {
  if (value.trim().length === 0) {
    throw new Error('Practice transaction id must not be empty.');
  }
}

function transactionDigest(transaction: PracticeInputTransaction): string {
  const value = transaction.type === 'submit'
    ? `${transaction.type}\u0000${transaction.kind}\u0000${transaction.text}`
    : transaction.type;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
