import { describe, expect, it } from 'vitest';
import {
  clampBackwardToGraphemeBoundary,
  findPreviousImmersivePageStart,
  paginateImmersiveText
} from '../../domain/immersivePaginator';

describe('immersive paginator', () => {
  it('never splits emoji, surrogate pairs, or combining graphemes', () => {
    const text = `Á👩‍💻😀中Z`;
    const page = paginateImmersiveText(text, 0, {
      visualLines: 2,
      graphemesPerLine: 2,
      availableLines: 2
    });
    expect(page.lines).toEqual(['Á👩‍💻', '😀中']);
    expect(page.lineRanges).toEqual([
      { startOffset: 0, endOffset: 'Á👩‍💻'.length },
      { startOffset: 'Á👩‍💻'.length, endOffset: 'Á👩‍💻😀中'.length }
    ]);
    expect(text.slice(page.startOffset, page.endOffset)).toBe('Á👩‍💻😀中');
    expect(clampBackwardToGraphemeBoundary(text, 1)).toBe(0);
  });

  it('only consumes text assigned to available editor lines', () => {
    const page = paginateImmersiveText('abcdefghijkl', 0, {
      visualLines: 3,
      graphemesPerLine: 4,
      availableLines: 2
    });
    expect(page.lines).toEqual(['abcd', 'efgh']);
    expect(page.lineRanges).toEqual([
      { startOffset: 0, endOffset: 4 },
      { startOffset: 4, endOffset: 8 }
    ]);
    expect(page.endOffset).toBe(8);
  });

  it('uses explicit line breaks and can reconstruct a stable previous page', () => {
    const text = 'abcd\r\nefghijkl';
    const first = paginateImmersiveText(text, 0, { visualLines: 2, graphemesPerLine: 4, availableLines: 2 });
    const second = paginateImmersiveText(text, first.endOffset, { visualLines: 2, graphemesPerLine: 4, availableLines: 2 });
    expect(first.lines).toEqual(['abcd', 'efgh']);
    expect(second.lines).toEqual(['ijkl']);
    expect(findPreviousImmersivePageStart(text, second.startOffset, {
      visualLines: 2,
      graphemesPerLine: 4,
      availableLines: 2
    })).toBe(0);
  });
});
