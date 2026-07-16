import { ReaderNavigationHistory, type ReaderHistoryLocation } from './readerNavigationHistory';

export type ReaderLocationRestore = (target: ReaderHistoryLocation) => boolean | Promise<boolean>;

export class ReaderNavigator {
  private readonly history: ReaderNavigationHistory;

  constructor(capacity = 50) {
    this.history = new ReaderNavigationHistory(capacity);
  }

  get canUndo(): boolean { return this.history.canUndo; }
  get historySize(): number { return this.history.size; }

  commit(before: ReaderHistoryLocation, after: ReaderHistoryLocation): boolean {
    if (sameVisibleLocation(before, after)) return false;
    this.history.push(before);
    return true;
  }

  async undo(restore: ReaderLocationRestore): Promise<boolean> {
    let target = this.history.pop();
    while (target) {
      if (await restore(target)) return true;
      target = this.history.pop();
    }
    return false;
  }

  clear(): void { this.history.clear(); }
}

function sameVisibleLocation(left: ReaderHistoryLocation, right: ReaderHistoryLocation): boolean {
  return left.sectionId === right.sectionId
    && left.textOffset === right.textOffset
    && left.sourceRevision === right.sourceRevision;
}
