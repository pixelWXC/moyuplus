import { clampBackwardToGraphemeBoundary } from './immersivePaginator';

export type ProjectionSegmentKind = 'identity' | 'collapsed' | 'synthetic' | 'hole' | 'anchor';

export interface ProjectionSegment {
  kind: ProjectionSegmentKind;
  sourceStart: number;
  sourceEnd: number;
  immersiveStart: number;
  immersiveEnd: number;
  safeSourceFloor: number;
  safeImmersiveFloor: number;
}

export interface ImmersiveResourceAnchor {
  resourceId: string;
  label: string;
  startOffset: number;
  endOffset: number;
}

export interface ImmersiveTextProjection {
  text: string;
  segments: ProjectionSegment[];
  resourceAnchors: ImmersiveResourceAnchor[];
  projectionRevision: string;
}

export function stripImmersiveResourceAnchors(projection: ImmersiveTextProjection): string {
  if (projection.resourceAnchors.length === 0) return projection.text;
  const chunks: string[] = [];
  let cursor = 0;
  for (const anchor of [...projection.resourceAnchors].sort((left, right) => left.startOffset - right.startOffset)) {
    const start = clampOffset(anchor.startOffset, projection.text.length);
    const end = clampOffset(anchor.endOffset, projection.text.length);
    if (end <= cursor || end <= start) continue;
    if (start > cursor) chunks.push(projection.text.slice(cursor, start));
    cursor = Math.max(cursor, end);
  }
  if (cursor < projection.text.length) chunks.push(projection.text.slice(cursor));
  return chunks.join('');
}

export function mapSourceOffsetToImmersive(
  projection: ImmersiveTextProjection,
  sourceOffset: number,
  sourceText?: string
): number {
  const input = sourceText
    ? clampBackwardToGraphemeBoundary(sourceText, sourceOffset)
    : clampOffset(sourceOffset, maxSourceOffset(projection));
  const segment = findSegment(projection.segments, input, 'source');
  const mapped = segment?.kind === 'identity' && equalLength(segment)
    ? segment.immersiveStart + input - segment.sourceStart
    : segment?.safeImmersiveFloor ?? 0;
  return clampBackwardToGraphemeBoundary(projection.text, mapped);
}

export function mapImmersiveOffsetToSource(
  projection: ImmersiveTextProjection,
  immersiveOffset: number,
  sourceText?: string
): number {
  const input = clampBackwardToGraphemeBoundary(projection.text, immersiveOffset);
  const segment = findSegment(projection.segments, input, 'immersive');
  const mapped = segment?.kind === 'identity' && equalLength(segment)
    ? segment.sourceStart + input - segment.immersiveStart
    : segment?.safeSourceFloor ?? 0;
  return sourceText
    ? clampBackwardToGraphemeBoundary(sourceText, mapped)
    : clampOffset(mapped, maxSourceOffset(projection));
}

function findSegment(
  segments: readonly ProjectionSegment[],
  offset: number,
  axis: 'source' | 'immersive'
): ProjectionSegment | undefined {
  const startKey = axis === 'source' ? 'sourceStart' : 'immersiveStart';
  const endKey = axis === 'source' ? 'sourceEnd' : 'immersiveEnd';
  let low = 0;
  let high = segments.length - 1;
  let candidate: ProjectionSegment | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (segment[startKey] <= offset) {
      candidate = segment;
      low = middle + 1;
    } else high = middle - 1;
  }
  if (candidate && (offset < candidate[endKey] || (offset === candidate[endKey] && offset === maxAxis(segments, endKey)))) {
    return candidate;
  }
  return segments.find(segment => segment[startKey] <= offset && offset < segment[endKey]);
}

function equalLength(segment: ProjectionSegment): boolean {
  return segment.sourceEnd - segment.sourceStart === segment.immersiveEnd - segment.immersiveStart;
}

function maxSourceOffset(projection: ImmersiveTextProjection): number {
  return maxAxis(projection.segments, 'sourceEnd');
}

function maxAxis(segments: readonly ProjectionSegment[], key: 'sourceEnd' | 'immersiveEnd'): number {
  return segments.reduce((maximum, segment) => Math.max(maximum, segment[key]), 0);
}

function clampOffset(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0));
}
