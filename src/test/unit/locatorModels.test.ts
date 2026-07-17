import { describe, expect, it } from 'vitest';
import { normalizeReadingLocator, normalizeReadingPosition } from '../../domain/locators';

describe('ReadingLocator', () => {
  it('normalizes TXT and EPUB locators and clamps section progression', () => {
    expect(normalizeReadingLocator({ kind: 'txt', sectionId: 'chapter-1', progression: 1.4, offset: 42.9, offsetSpace: 'book' })).toEqual({
      kind: 'txt',
      sectionId: 'chapter-1',
      progression: 1,
      offset: 42,
      offsetSpace: 'book'
    });
    expect(
      normalizeReadingLocator({
        kind: 'epub',
        sectionId: 'spine-1',
        progression: -0.2,
        cfi: 'epubcfi(/6/2)',
        fragment: 'intro',
        textOffset: 42.9,
        immersiveOffset: 24.9,
        sourceRevision: 'sha256:revision-1',
        projectionRevision: 'projection-v1'
      })
    ).toEqual({
      kind: 'epub',
      sectionId: 'spine-1',
      progression: 0,
      cfi: 'epubcfi(/6/2)',
      fragment: 'intro',
      textOffset: 42,
      immersiveOffset: 24,
      sourceRevision: 'sha256:revision-1',
      projectionRevision: 'projection-v1'
    });
  });

  it('keeps EPUB text offsets only when they are valid persistent hints', () => {
    expect(normalizeReadingLocator({
      kind: 'epub', sectionId: 'spine-1', progression: 0.4,
      textOffset: -1, sourceRevision: ''
    })).toEqual({ kind: 'epub', sectionId: 'spine-1', progression: 0.4 });
    expect(normalizeReadingLocator({
      kind: 'epub', sectionId: 'spine-1', progression: 0.4,
      textOffset: 0, sourceRevision: 'revision-2', history: [{ sectionId: 'secret' }]
    })).toEqual({
      kind: 'epub', sectionId: 'spine-1', progression: 0.4,
      textOffset: 0, sourceRevision: 'revision-2'
    });
  });

  it('rejects unknown kinds and missing section identity', () => {
    expect(normalizeReadingLocator({ kind: 'pdf', sectionId: 'one', progression: 0 })).toBeUndefined();
    expect(normalizeReadingLocator({ kind: 'txt', sectionId: '', progression: 0 })).toBeUndefined();
  });
});

describe('ReadingPosition', () => {
  it('clamps whole-book progression and strips transient text matching hints', () => {
    const position = normalizeReadingPosition({
      bookId: 'book-1',
      locator: {
        kind: 'txt',
        sectionId: 'chapter-1',
        progression: 0.25,
        offset: 120,
        textQuote: 'must never persist'
      },
      bookProgression: 4,
      updatedAt: 123,
      textQuote: 'must never persist',
      content: '正文'
    });

    expect(position).toEqual({
      bookId: 'book-1',
      locator: { kind: 'txt', sectionId: 'chapter-1', progression: 0.25, offset: 120 },
      bookProgression: 1,
      updatedAt: 123
    });
    expect(JSON.stringify(position)).not.toMatch(/textQuote|正文/);
  });

  it('rejects damaged persistent identity and timestamps', () => {
    expect(
      normalizeReadingPosition({
        bookId: '',
        locator: { kind: 'txt', sectionId: 'one', progression: 0 },
        bookProgression: 0,
        updatedAt: 1
      })
    ).toBeUndefined();
    expect(
      normalizeReadingPosition({
        bookId: 'book-1',
        locator: { kind: 'txt', sectionId: 'one', progression: 0 },
        bookProgression: 0,
        updatedAt: Number.NaN
      })
    ).toBeUndefined();
  });
});
