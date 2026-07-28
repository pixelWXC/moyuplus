import { describe, expect, it } from 'vitest';
import {
  buildPracticeSnapshot,
  normalizeMaterialText,
  preparePracticeContent,
  type PracticePlan,
  type TargetUnit
} from '../../typing';

const freePlan: PracticePlan = {
  contentRecipe: { kind: 'adHoc', text: 'placeholder' },
  completion: { kind: 'free' },
  evaluation: { errorPolicy: 'block' },
  textPolicy: {
    punctuation: { mode: 'equivalent', mappingVersion: 'zh-punctuation-v1' },
    whitespace: { mode: 'trimLineEdges' },
    caseSensitive: true
  },
  flowPolicy: { lineAdvance: 'automatic', presentation: 'continuous' },
  displayPolicy: { showLiveMetrics: true, showWhitespace: false }
};

describe('typing content preparation', () => {
  it('normalizes newlines, removes a BOM, and compresses excess blank lines', () => {
    const input = '\uFEFF第一行\r\n\r\n \r\n\r\n第二行\r第三行';

    expect(normalizeMaterialText(input)).toBe('第一行\n\n第二行\n第三行');
  });

  it('segments Unicode graphemes while preserving spaces and line boundaries as targets', () => {
    const prepared = preparePracticeContent('你a e\u0301👨‍👩‍👧‍👦\n好', {
      sourceRevision: 'fixture-v1',
      contentProfile: { kind: 'mixed', category: 'adHoc' },
      range: { kind: 'whole' }
    });

    expect(prepared.counts).toEqual({
      graphemes: 7,
      hanGraphemes: 2,
      englishWords: 2,
      printableUnits: 5
    });
    expect(prepared.targetUnits.map(unit => [unit.value, unit.kind, unit.lineIndex])).toEqual([
      ['你', 'grapheme', 0],
      ['a', 'grapheme', 0],
      [' ', 'space', 0],
      ['e\u0301', 'grapheme', 0],
      ['👨‍👩‍👧‍👦', 'grapheme', 0],
      ['\n', 'lineBreak', 0],
      ['好', 'grapheme', 1]
    ]);
    expect(prepared.displayLines).toEqual([
      { index: 0, text: '你a e\u0301👨‍👩‍👧‍👦', targetStart: 0, targetEnd: 6 },
      { index: 1, text: '好', targetStart: 6, targetEnd: 7 }
    ]);
  });

  it('applies a selection after cleanup and estimates from the selected content only', () => {
    const prepared = preparePracticeContent('忽略\r\n保留文本\r\n忽略', {
      sourceRevision: 'selection-v1',
      contentProfile: { kind: 'chinese', category: 'modernArticle' },
      range: { kind: 'selection', start: 3, end: 7 }
    });

    expect(prepared.normalizedText).toBe('保留文本');
    expect(prepared.selectedRange).toEqual({ kind: 'selection', start: 3, end: 7 });
    expect(prepared.counts.graphemes).toBe(4);
    expect(prepared.estimatedSeconds).toBeGreaterThan(0);
  });

  it('rejects content beyond the snapshot grapheme budget', () => {
    expect(() => preparePracticeContent('字'.repeat(200_001), {
      sourceRevision: 'too-large',
      contentProfile: { kind: 'chinese', category: 'modernArticle' },
      range: { kind: 'whole' }
    })).toThrow('Practice content exceeds 200000 graphemes');
  });

  it('builds a recursively frozen snapshot detached from prepared content arrays', () => {
    const prepared = preparePracticeContent('你好', {
      sourceRevision: 'snapshot-v1',
      contentProfile: { kind: 'chinese', category: 'adHoc' },
      range: { kind: 'whole' }
    });
    const snapshot = buildPracticeSnapshot({
      id: 'snapshot-1',
      createdAt: 123,
      plan: freePlan,
      prepared
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      id: 'snapshot-1',
      sourceRevision: 'snapshot-v1',
      createdAt: 123
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.targetUnits)).toBe(true);
    expect(Object.isFrozen(snapshot.targetUnits[0])).toBe(true);
    expect(() => snapshot.targetUnits.push({} as TargetUnit)).toThrow();
    prepared.targetUnits[0].value = '改';
    expect(snapshot.targetUnits[0].value).toBe('你');
  });
});
