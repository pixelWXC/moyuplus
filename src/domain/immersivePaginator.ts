export interface ImmersivePaginationOptions {
  visualLines: number;
  graphemesPerLine: number;
  availableLines: number;
}

export interface ImmersivePage {
  startOffset: number;
  endOffset: number;
  lines: string[];
  lineRanges: Array<{ startOffset: number; endOffset: number }>;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function paginateImmersiveText(
  text: string,
  requestedStart: number,
  options: ImmersivePaginationOptions
): ImmersivePage {
  const startOffset = clampBackwardToGraphemeBoundary(text, requestedStart);
  const lineLimit = clampInteger(Math.min(options.visualLines, options.availableLines), 0, 1000);
  const graphemeLimit = clampInteger(options.graphemesPerLine, 1, 10000);
  if (startOffset >= text.length || lineLimit === 0) {
    return { startOffset, endOffset: startOffset, lines: [], lineRanges: [] };
  }

  const segments = [...segmenter.segment(text.slice(startOffset))];
  const lines: string[] = [];
  const lineRanges: ImmersivePage['lineRanges'] = [];
  let current = '';
  let count = 0;
  let consumed = 0;
  let lineStart = 0;
  let lineEndedAtLimit = false;

  for (const item of segments) {
    if (lines.length >= lineLimit) break;
    const value = item.segment;
    const isBreak = value === '\n' || value === '\r' || value === '\r\n';
    if (isBreak) {
      consumed = item.index + value.length;
      if (current.length > 0 || !lineEndedAtLimit) {
        lines.push(current);
        lineRanges.push({ startOffset: startOffset + lineStart, endOffset: startOffset + item.index });
      }
      current = '';
      count = 0;
      lineStart = consumed;
      lineEndedAtLimit = false;
      continue;
    }
    current += value;
    count += 1;
    consumed = item.index + value.length;
    if (count >= graphemeLimit) {
      lines.push(current);
      lineRanges.push({ startOffset: startOffset + lineStart, endOffset: startOffset + consumed });
      current = '';
      count = 0;
      lineStart = consumed;
      lineEndedAtLimit = true;
    } else {
      lineEndedAtLimit = false;
    }
  }
  if (lines.length < lineLimit && current.length > 0) {
    lines.push(current);
    lineRanges.push({ startOffset: startOffset + lineStart, endOffset: startOffset + consumed });
  }
  return {
    startOffset,
    endOffset: startOffset + consumed,
    lines: lines.slice(0, lineLimit),
    lineRanges: lineRanges.slice(0, lineLimit)
  };
}

export function findPreviousImmersivePageStart(
  text: string,
  currentStart: number,
  options: ImmersivePaginationOptions
): number {
  const target = clampBackwardToGraphemeBoundary(text, currentStart);
  if (target <= 0) return 0;
  let start = 0;
  let previous = 0;
  while (start < target) {
    const page = paginateImmersiveText(text, start, options);
    if (page.endOffset <= start || page.endOffset >= target) return previous;
    previous = start;
    start = page.endOffset;
  }
  return previous;
}

export function clampBackwardToGraphemeBoundary(text: string, requestedOffset: number): number {
  const offset = Math.min(text.length, Math.max(0, Number.isFinite(requestedOffset) ? Math.trunc(requestedOffset) : 0));
  if (offset === 0 || offset === text.length) return offset;
  let boundary = 0;
  for (const item of segmenter.segment(text)) {
    if (item.index > offset) break;
    boundary = item.index;
    if (item.index === offset) return offset;
  }
  return boundary;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
