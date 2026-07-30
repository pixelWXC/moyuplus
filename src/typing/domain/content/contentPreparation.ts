import type {
  ContentProfile,
  PracticeDisplayLine,
  PracticePlan,
  PracticeSnapshot,
  PreparedContent,
  SourceRange,
  TargetUnit,
  TargetUnitKind
} from './index';
import { TYPING_SCHEMA_VERSION } from './index';

export const MAX_PRACTICE_GRAPHEMES = 200_000;

export interface PreparePracticeContentOptions {
  sourceRevision: string;
  contentProfile: ContentProfile;
  range: SourceRange;
  materialId?: string;
  generatorSeed?: string;
}

export interface BuildPracticeSnapshotInput {
  id: string;
  createdAt: number;
  plan: PracticePlan;
  prepared: PreparedContent;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const englishWordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });

export function normalizeMaterialText(text: string): string {
  const normalized = stripBom(text).replace(/\r\n?|\u2028|\u2029/g, '\n');
  const output: string[] = [];
  let previousWasBlank = false;

  for (const line of normalized.split('\n')) {
    const isBlank = line.trim().length === 0;
    if (!isBlank) {
      output.push(line);
      previousWasBlank = false;
      continue;
    }
    if (!previousWasBlank) {
      output.push('');
      previousWasBlank = true;
    }
  }

  return output.join('\n');
}

export function inferAdHocContentProfile(text: string): ContentProfile {
  const hasHan = /\p{Script=Han}/u.test(text);
  const hasLatin = /\p{Script=Latin}/u.test(text);
  if (hasHan && hasLatin) return { kind: 'mixed', category: 'adHoc' };
  if (hasLatin) return { kind: 'english', category: 'adHoc' };
  return { kind: 'chinese', category: 'adHoc' };
}

export function preparePracticeContent(
  sourceText: string,
  options: PreparePracticeContentOptions
): PreparedContent {
  if (options.sourceRevision.trim().length === 0) {
    throw new Error('Practice content requires a source revision.');
  }
  const cleaned = normalizeMaterialText(sourceText);
  const normalizedText = selectRange(cleaned, options.range);
  if (normalizedText.length === 0) {
    throw new Error('Practice content is empty.');
  }

  const graphemes = segmentGraphemes(normalizedText);
  if (graphemes.length > MAX_PRACTICE_GRAPHEMES) {
    throw new Error(`Practice content exceeds ${MAX_PRACTICE_GRAPHEMES} graphemes.`);
  }

  const targetUnits = createTargetUnits(graphemes);
  assignWordKeys(normalizedText, targetUnits, options.contentProfile);
  const counts = {
    graphemes: graphemes.length,
    hanGraphemes: graphemes.filter(value => /\p{Script=Han}/u.test(value)).length,
    englishWords: countEnglishWords(normalizedText),
    printableUnits: graphemes.filter(value => !/^\s+$/u.test(value)).length
  };

  return {
    materialId: options.materialId,
    sourceRevision: options.sourceRevision,
    contentProfile: structuredClone(options.contentProfile),
    generatorSeed: options.generatorSeed,
    normalizedText,
    counts,
    estimatedSeconds: estimateSeconds(counts.printableUnits, options.contentProfile),
    selectedRange: structuredClone(options.range),
    targetUnits,
    displayLines: createDisplayLines(normalizedText, targetUnits)
  };
}

export function buildPracticeSnapshot(input: BuildPracticeSnapshotInput): PracticeSnapshot {
  if (input.id.trim().length === 0) {
    throw new Error('Practice snapshot requires an id.');
  }
  const snapshot: PracticeSnapshot = {
    schemaVersion: TYPING_SCHEMA_VERSION,
    id: input.id,
    materialId: input.prepared.materialId,
    sourceRevision: input.prepared.sourceRevision,
    contentProfile: structuredClone(input.prepared.contentProfile),
    plan: structuredClone(input.plan),
    generatorSeed: input.prepared.generatorSeed,
    targetUnits: structuredClone(input.prepared.targetUnits),
    displayLines: structuredClone(input.prepared.displayLines),
    selectedRange: structuredClone(input.prepared.selectedRange),
    createdAt: input.createdAt
  };
  return deepFreeze(snapshot);
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function selectRange(text: string, range: SourceRange): string {
  if (range.kind !== 'selection') {
    return text;
  }
  const start = Math.trunc(range.start);
  const end = Math.trunc(range.end);
  if (start < 0 || end <= start || end > text.length) {
    throw new Error('Practice selection range is invalid.');
  }
  const boundaries = new Set<number>([0, text.length]);
  for (const segment of graphemeSegmenter.segment(text)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  if (!boundaries.has(start) || !boundaries.has(end)) {
    throw new Error('Practice selection must align to grapheme boundaries.');
  }
  return text.slice(start, end);
}

function segmentGraphemes(text: string): string[] {
  return [...graphemeSegmenter.segment(text)].map(segment => segment.segment);
}

function createTargetUnits(graphemes: string[]): TargetUnit[] {
  const units: TargetUnit[] = [];
  let lineIndex = 0;
  for (const value of graphemes) {
    const kind = targetKind(value);
    units.push({
      index: units.length,
      value,
      display: displayValue(value, kind),
      kind,
      lineIndex
    });
    if (kind === 'lineBreak') {
      lineIndex += 1;
    }
  }
  return units;
}

function assignWordKeys(
  text: string,
  units: TargetUnit[],
  profile: ContentProfile
): void {
  const spans = createUnitSpans(units);
  if (profile.kind === 'mastery') {
    let offset = 0;
    for (const line of text.split('\n')) {
      const start = offset;
      const end = start + line.length;
      if (line.length > 0) {
        assignSpanWordKey(spans, units, start, end, line);
      }
      offset = end + 1;
    }
    return;
  }
  if (profile.kind === 'code') {
    const tokenPattern = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|===|!==|=>|==|!=|<=|>=|&&|\|\||[^\s]/gu;
    for (const match of text.matchAll(tokenPattern)) {
      if (match.index === undefined) continue;
      assignSpanWordKey(
        spans,
        units,
        match.index,
        match.index + match[0].length,
        match[0]
      );
    }
    return;
  }
  if (profile.kind !== 'chinese' && profile.kind !== 'english') {
    return;
  }
  const segmenter = new Intl.Segmenter(
    profile.kind === 'chinese' ? 'zh' : 'en',
    { granularity: 'word' }
  );
  for (const segment of segmenter.segment(text)) {
    if (!segment.isWordLike) continue;
    assignSpanWordKey(
      spans,
      units,
      segment.index,
      segment.index + segment.segment.length,
      segment.segment
    );
  }
}

function createUnitSpans(units: TargetUnit[]): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let offset = 0;
  for (const unit of units) {
    spans.push({ start: offset, end: offset + unit.value.length });
    offset += unit.value.length;
  }
  return spans;
}

function assignSpanWordKey(
  spans: Array<{ start: number; end: number }>,
  units: TargetUnit[],
  start: number,
  end: number,
  wordKey: string
): void {
  for (let index = 0; index < spans.length; index += 1) {
    if (spans[index].end <= start) continue;
    if (spans[index].start >= end) break;
    units[index].wordKey = wordKey;
  }
}

function targetKind(value: string): TargetUnitKind {
  if (value === '\n') return 'lineBreak';
  if (value === '\t') return 'tab';
  if (/^\s+$/u.test(value)) return 'space';
  return 'grapheme';
}

function displayValue(value: string, kind: TargetUnitKind): string {
  if (kind === 'tab') return '→';
  if (kind === 'lineBreak') return '↵';
  return value;
}

function createDisplayLines(text: string, units: TargetUnit[]): PracticeDisplayLine[] {
  const textLines = text.split('\n');
  const result: PracticeDisplayLine[] = [];
  let targetStart = 0;
  for (let index = 0; index < textLines.length; index += 1) {
    let targetEnd = targetStart;
    while (targetEnd < units.length && units[targetEnd].lineIndex === index) {
      targetEnd += 1;
    }
    result.push({
      index,
      text: textLines[index],
      targetStart,
      targetEnd
    });
    targetStart = targetEnd;
  }
  return result;
}

function countEnglishWords(text: string): number {
  let count = 0;
  for (const segment of englishWordSegmenter.segment(text)) {
    if (segment.isWordLike && /\p{Script=Latin}/u.test(segment.segment)) {
      count += 1;
    }
  }
  return count;
}

function estimateSeconds(printableUnits: number, profile: ContentProfile): number {
  const unitsPerMinute = profile.kind === 'chinese'
    ? 60
    : profile.kind === 'english'
      ? 180
      : profile.kind === 'code'
        ? 80
        : 100;
  return Math.max(1, Math.ceil((printableUnits / unitsPerMinute) * 60));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
