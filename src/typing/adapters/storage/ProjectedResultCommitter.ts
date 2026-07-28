import type { PracticeResult } from '../../domain/analytics';
import type { PracticeResultCommitPort } from '../../application/ports';

export interface ResultFactCommitPort {
  commit(result: PracticeResult): Promise<void>;
}

export interface ProjectionRefreshPort {
  refresh(): Promise<unknown>;
}

export class ProjectedResultCommitter implements PracticeResultCommitPort {
  constructor(
    private readonly facts: ResultFactCommitPort,
    private readonly projections: readonly ProjectionRefreshPort[]
  ) {}

  async commit(result: PracticeResult): Promise<void> {
    await this.facts.commit(result);
    for (const projection of this.projections) {
      await projection.refresh();
    }
  }
}
