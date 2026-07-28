import type { PracticeResult } from '../../domain/analytics';
import type { PracticeResultCommitPort } from '../../application/ports';
import {
  PendingResultStore,
  type PendingResultRetrySummary
} from './PendingResultStore';

export interface ResilientPracticeResultCommitterOptions {
  onPending?: (result: PracticeResult, error: unknown) => void | Promise<void>;
}

export class ResilientPracticeResultCommitter implements PracticeResultCommitPort {
  constructor(
    private readonly globalResults: PracticeResultCommitPort,
    private readonly pendingResults: PendingResultStore,
    private readonly options: ResilientPracticeResultCommitterOptions = {}
  ) {}

  async commit(result: PracticeResult): Promise<void> {
    try {
      await this.globalResults.commit(result);
    } catch (error) {
      await this.pendingResults.save(result.sessionId, result);
      await this.options.onPending?.(structuredClone(result), error);
    }
  }

  retryPending(): Promise<PendingResultRetrySummary> {
    return this.pendingResults.retryAll(this.globalResults);
  }
}
