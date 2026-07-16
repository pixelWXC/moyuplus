export interface TextTreeNode {
  readonly nodeType: number;
  readonly childNodes: ArrayLike<TextTreeNode>;
  readonly id?: string;
  readonly data?: string;
}

export interface TextOffsetPoint {
  node: TextTreeNode;
  offset: number;
}

export class InternalTargetResolver {
  private readonly nodes: TextTreeNode[] = [];
  private readonly ranges = new Map<TextTreeNode, { startSegment: number; endSegment: number; order: number }>();
  private readonly segments: Array<{ node: TextTreeNode; start: number; end: number; order: number }> = [];

  constructor(root: TextTreeNode) { this.index(root); }

  get totalLength(): number { return this.segments.at(-1)?.end ?? 0; }

  resolveFragment(fragment: string): number | undefined {
    const target = this.nodes.find(node => node.id === fragment);
    if (!target) return undefined;
    const range = this.ranges.get(target);
    if (!range) return undefined;
    const contained = this.segments[range.startSegment];
    if (contained && range.startSegment < range.endSegment) return contained.start;
    const following = this.segments.find(segment => segment.order > range.order);
    if (following) return following.start;
    for (let index = this.segments.length - 1; index >= 0; index -= 1) {
      if (this.segments[index].order < range.order) return this.segments[index].end;
    }
    return undefined;
  }

  pointForOffset(offset: number): TextOffsetPoint | undefined {
    if (this.segments.length === 0) return undefined;
    const clamped = Math.max(0, Math.min(this.totalLength, Number.isFinite(offset) ? Math.trunc(offset) : 0));
    const segment = this.segments.find(candidate => clamped === candidate.start || clamped < candidate.end);
    if (segment) return { node: segment.node, offset: clamped - segment.start };
    const final = this.segments.at(-1)!;
    return { node: final.node, offset: final.end - final.start };
  }

  private index(node: TextTreeNode): void {
    const order = this.nodes.length;
    this.nodes.push(node);
    const startSegment = this.segments.length;
    if (node.nodeType === 3 && typeof node.data === 'string' && node.data.length > 0) {
      const start = this.totalLength;
      this.segments.push({ node, start, end: start + node.data.length, order });
    }
    for (const child of Array.from(node.childNodes)) this.index(child);
    this.ranges.set(node, { startSegment, endSegment: this.segments.length, order });
  }
}
