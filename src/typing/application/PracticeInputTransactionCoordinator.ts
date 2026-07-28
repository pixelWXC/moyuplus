import type { PracticeSnapshot } from '../domain/content';
import {
  PracticeTransactionEngine,
  type PracticeInputOrigin,
  type PracticeInputTransaction,
  type PracticeSessionDelta,
  type PracticeSessionState,
  type PracticeTransactionReceipt
} from '../domain/session';
import {
  PracticePanelSnapshotProjector,
  type PracticePanelSnapshot
} from './PracticePanelSnapshotProjector';

export interface PracticeInputTransactionAuthority {
  get(sessionId: string): PromiseLike<PracticeSessionState | undefined>;
  replace(session: PracticeSessionState): PromiseLike<void> | void;
}

export interface PracticeInputTransactionJournal {
  append(
    sessionId: string,
    delta: PracticeSessionDelta
  ): PromiseLike<'appended' | 'duplicate'>;
  recover(
    sessionId: string,
    checkpointRevision: number
  ): PromiseLike<PracticeSessionDelta[]>;
  findReceipt(
    sessionId: string,
    transactionId: string
  ): PromiseLike<PracticeTransactionReceipt | undefined>;
}

export interface PracticeInputTransactionCoordinatorOptions {
  authority: PracticeInputTransactionAuthority;
  snapshots: {
    get(snapshotId: string): PromiseLike<PracticeSnapshot | undefined>;
  };
  journal: PracticeInputTransactionJournal;
  engine?: PracticeTransactionEngine;
  projector?: PracticePanelSnapshotProjector;
  clock: {
    wallNow(): number;
  };
  nextAttemptId(): string;
  complete?(
    session: PracticeSessionState,
    snapshot: PracticeSnapshot
  ): PromiseLike<void>;
}

export interface SubmitPracticeInputTransaction {
  sessionId: string;
  transactionId: string;
  baseRevision: number;
  kind: PracticeInputOrigin;
  text: string;
}

export interface CorrectPracticeInputTransaction {
  sessionId: string;
  transactionId: string;
  baseRevision: number;
}

export interface PracticeInputTransactionAck {
  outcome: 'applied' | 'blocked' | 'stale' | 'completed';
  transactionRevision?: number;
  currentRevision: number;
  consumedText: string;
  unconsumedText: string;
  snapshot: PracticePanelSnapshot;
}

export class PracticeInputTransactionCoordinator {
  private readonly engine: PracticeTransactionEngine;
  private readonly projector: PracticePanelSnapshotProjector;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly options: PracticeInputTransactionCoordinatorOptions) {
    this.engine = options.engine ?? new PracticeTransactionEngine();
    this.projector = options.projector ?? new PracticePanelSnapshotProjector();
  }

  submit(
    command: SubmitPracticeInputTransaction
  ): Promise<PracticeInputTransactionAck> {
    return this.enqueue(command.sessionId, () => this.transact(command.sessionId, {
      type: 'submit',
      transactionId: command.transactionId,
      baseRevision: command.baseRevision,
      kind: command.kind,
      text: command.text
    }));
  }

  correct(
    command: CorrectPracticeInputTransaction
  ): Promise<PracticeInputTransactionAck> {
    return this.enqueue(command.sessionId, () => this.transact(command.sessionId, {
      type: 'correct',
      transactionId: command.transactionId,
      baseRevision: command.baseRevision
    }));
  }

  async snapshot(sessionId: string): Promise<PracticePanelSnapshot> {
    return this.enqueue(sessionId, async () => {
      const { session, snapshot } = await this.loadAuthority(sessionId);
      return this.projector.project(session, snapshot);
    });
  }

  private async transact(
    sessionId: string,
    transaction: PracticeInputTransaction
  ): Promise<PracticeInputTransactionAck> {
    const { session, snapshot } = await this.loadAuthority(sessionId);
    const knownReceipt = session.transactionReceipts[transaction.transactionId]
      ?? await this.options.journal.findReceipt(sessionId, transaction.transactionId);
    if (knownReceipt) {
      return this.ackFromReceipt(knownReceipt, session, snapshot);
    }
    if (transaction.baseRevision !== session.revision) {
      return {
        outcome: 'stale',
        currentRevision: session.revision,
        consumedText: '',
        unconsumedText: transaction.type === 'submit' ? transaction.text : '',
        snapshot: this.projector.project(session, snapshot)
      };
    }
    if (session.status === 'completed') {
      return {
        outcome: 'completed',
        currentRevision: session.revision,
        consumedText: '',
        unconsumedText: transaction.type === 'submit' ? transaction.text : '',
        snapshot: this.projector.project(session, snapshot)
      };
    }

    const calculation = this.engine.calculate({
      session,
      snapshot,
      transaction,
      wallTime: this.options.clock.wallNow(),
      nextAttemptId: this.options.nextAttemptId
    });
    if (calculation.kind === 'duplicate') {
      return this.ackFromReceipt(calculation.receipt, session, snapshot);
    }
    await this.options.journal.append(sessionId, calculation.delta);
    const candidate = structuredClone(session);
    this.engine.applyDelta(candidate, calculation.delta);
    if (candidate.status === 'completed') {
      await this.options.complete?.(candidate, snapshot);
    }
    await this.options.authority.replace(candidate);
    return this.ackFromReceipt(calculation.receipt, candidate, snapshot);
  }

  private async loadAuthority(sessionId: string): Promise<{
    session: PracticeSessionState;
    snapshot: PracticeSnapshot;
  }> {
    const authority = await this.options.authority.get(sessionId);
    if (!authority) {
      throw new Error(`Practice session not found: ${sessionId}`);
    }
    let session = authority;
    const recovered = await this.options.journal.recover(sessionId, session.revision);
    if (recovered.length > 0) {
      const candidate = structuredClone(session);
      for (const delta of recovered) {
        this.engine.applyDelta(candidate, delta);
      }
      const recoveredSnapshot = await this.options.snapshots.get(candidate.snapshotId);
      if (!recoveredSnapshot) {
        throw new Error(`Practice snapshot not found: ${candidate.snapshotId}`);
      }
      if (candidate.status === 'completed') {
        await this.options.complete?.(candidate, recoveredSnapshot);
      }
      await this.options.authority.replace(candidate);
      session = candidate;
    }
    const snapshot = await this.options.snapshots.get(session.snapshotId);
    if (!snapshot) {
      throw new Error(`Practice snapshot not found: ${session.snapshotId}`);
    }
    return { session, snapshot };
  }

  private ackFromReceipt(
    receipt: PracticeTransactionReceipt,
    session: PracticeSessionState,
    snapshot: PracticeSnapshot
  ): PracticeInputTransactionAck {
    return {
      outcome: receipt.outcome,
      transactionRevision: receipt.revision,
      currentRevision: session.revision,
      consumedText: receipt.consumedText,
      unconsumedText: receipt.unconsumedText,
      snapshot: this.projector.project(session, snapshot)
    };
  }

  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const run = previous.then(task);
    const settled = run.then(() => undefined, () => undefined);
    this.queues.set(sessionId, settled);
    void settled.then(() => {
      if (this.queues.get(sessionId) === settled) {
        this.queues.delete(sessionId);
      }
    });
    return run;
  }
}
