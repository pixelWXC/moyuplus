export interface ReaderHistoryLocation {
  sectionId: string;
  textOffset: number;
  progression: number;
  fragment?: string;
  sourceRevision: string;
}

export class ReaderNavigationHistory {
  private readonly entries: ReaderHistoryLocation[] = [];

  constructor(private readonly capacity = 50) {}

  get size(): number { return this.entries.length; }
  get canUndo(): boolean { return this.entries.length > 0; }

  push(location: ReaderHistoryLocation): void {
    const copy = { ...location };
    const latest = this.entries.at(-1);
    if (latest && sameLocation(latest, copy)) return;
    this.entries.push(copy);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  pop(): ReaderHistoryLocation | undefined {
    const location = this.entries.pop();
    return location ? { ...location } : undefined;
  }

  clear(): void { this.entries.length = 0; }
}

function sameLocation(left: ReaderHistoryLocation, right: ReaderHistoryLocation): boolean {
  return left.sectionId === right.sectionId
    && left.textOffset === right.textOffset
    && left.progression === right.progression
    && left.fragment === right.fragment
    && left.sourceRevision === right.sourceRevision;
}
