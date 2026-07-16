import { describe, expect, it } from 'vitest';
import type { BookRecord } from '../../domain/books';
import { createDefaultReaderPreferences } from '../../domain/readerPreferences';
import {
  REMOVE_BOOK_CONFIRMATION,
  createInitialReaderAppState,
  getLibraryBookActions,
  readerAppReducer
} from '../../webview/readerState';

function book(id: string, format: 'txt' | 'epub'): BookRecord {
  const base = {
    schemaVersion: 2 as const,
    id,
    uri: `file:///books/${id}.${format}`,
    source: 'external' as const,
    title: format === 'txt' ? '日常练习' : 'Clean Architecture',
    authors: format === 'txt' ? [] : ['Robert C. Martin'],
    capabilities: { readable: true as const, typing: format === 'txt', toc: true },
    createdAt: 1,
    updatedAt: 1
  };
  return format === 'txt'
    ? { ...base, format, formatData: { encoding: 'utf8' } }
    : { ...base, format, formatData: {} };
}

describe('reader Webview library state', () => {
  it('represents an empty library as ready without a duplicate import action', () => {
    const state = readerAppReducer(createInitialReaderAppState(), {
      type: 'libraryLoaded',
      books: [],
      availability: {},
      progress: {}
    });

    expect(state.view).toBe('library');
    expect(state.status).toBe('ready');
    expect(state.books).toEqual([]);
    expect(state).not.toHaveProperty('emptyAction');
  });

  it('keeps EPUB and TXT metadata and progress together in a mixed library', () => {
    const txt = book('txt-1', 'txt');
    const epub = book('epub-1', 'epub');
    const state = readerAppReducer(createInitialReaderAppState(), {
      type: 'libraryLoaded',
      books: [txt, epub],
      availability: { 'txt-1': true, 'epub-1': true },
      progress: { 'txt-1': 0.25, 'epub-1': 0.7 }
    });

    expect(state.books).toEqual([
      expect.objectContaining({ id: 'txt-1', format: 'txt', progress: 0.25, available: true }),
      expect.objectContaining({ id: 'epub-1', format: 'epub', progress: 0.7, available: true })
    ]);
  });

  it('marks a missing source as invalid and offers recovery actions', () => {
    const missing = book('missing', 'txt');
    const state = readerAppReducer(createInitialReaderAppState(), {
      type: 'libraryLoaded',
      books: [missing],
      availability: { missing: false },
      progress: {}
    });

    expect(state.books[0]).toMatchObject({ available: false, status: 'missing' });
    expect(getLibraryBookActions(state.books[0])).toEqual(['open', 'startTypingPractice', 'relocate', 'remove']);
  });

  it('uses explicit removal copy that promises the original file is untouched', () => {
    const state = readerAppReducer(createInitialReaderAppState(), {
      type: 'requestRemove',
      bookId: 'txt-1'
    });

    expect(state.pendingRemoval).toEqual({ bookId: 'txt-1', message: REMOVE_BOOK_CONFIRMATION });
    expect(REMOVE_BOOK_CONFIRMATION).toContain('不会删除原文件');
  });

  it('closes a removal confirmation when the refreshed library no longer contains that book', () => {
    const pending = readerAppReducer(createInitialReaderAppState(), { type: 'requestRemove', bookId: 'txt-1' });
    const refreshed = readerAppReducer(pending, {
      type: 'libraryLoaded', books: [], availability: {}, progress: {}
    });
    expect(refreshed.pendingRemoval).toBeUndefined();
  });

  it('never exposes typing practice for EPUB books', () => {
    const epub = book('epub-1', 'epub');
    const state = readerAppReducer(createInitialReaderAppState(), {
      type: 'libraryLoaded',
      books: [epub],
      availability: { 'epub-1': true },
      progress: {}
    });

    expect(getLibraryBookActions(state.books[0])).toEqual(['open', 'relocate', 'remove']);
    expect(getLibraryBookActions(state.books[0])).not.toContain('startTypingPractice');
  });
});

describe('reader Webview reading state', () => {
  it('opens a book with nested TOC, selects its initial section and closes back to the library', () => {
    const initial = readerAppReducer(createInitialReaderAppState(), { type: 'openReader', book: book('epub-1', 'epub'), requestId: 'r1' });
    const ready = readerAppReducer(initial, {
      type: 'bookReady', requestId: 'r1',
      toc: [{ title: 'Part I', sectionId: 'one', children: [{ title: 'Chapter 2', sectionId: 'two' }] }],
      sections: [{ id: 'one', title: 'Chapter 1', order: 0, progressionWeight: 1 }, { id: 'two', title: 'Chapter 2', order: 1, progressionWeight: 1 }],
      initialSectionId: 'one', initialProgression: 0.625
    });
    expect(ready).toMatchObject({ view: 'reader', status: 'loading', activeSectionId: 'one', initialProgression: 0.625 });
    expect(ready.toc?.[0].children?.[0].sectionId).toBe('two');
    expect(readerAppReducer(ready, { type: 'closeReader' })).toMatchObject({ view: 'library', initialProgression: undefined });
  });

  it('derives chapter and page capabilities and exposes non-blocking book-edge feedback', () => {
    let state = readerAppReducer(createInitialReaderAppState(), { type: 'openReader', book: book('epub-1', 'epub'), requestId: 'r1' });
    state = readerAppReducer(state, {
      type: 'bookReady', requestId: 'r1', toc: [], initialSectionId: 'one',
      sections: [{ id: 'one', order: 0, progressionWeight: 1 }, { id: 'two', order: 1, progressionWeight: 1 }]
    });
    state = readerAppReducer(state, {
      type: 'layoutChanged', sectionId: 'one', pageIndex: 0, pageCount: 1, progression: 0,
      startOffset: 0, endOffset: 5, canPreviousPage: false, canNextPage: false, isSectionStart: true, isSectionEnd: true
    });
    expect(state.navigation).toMatchObject({ canPreviousPage: false, canNextPage: true, canPreviousSection: false, canNextSection: true });
    expect(readerAppReducer(state, { type: 'bookBoundary', edge: 'start' }).notice).toBe('已到本书开头');
  });

  it('previews preferences, saves them, resets defaults and manages one overlay drawer', () => {
    let state = readerAppReducer(createInitialReaderAppState(), { type: 'preferencesLoaded', preferences: { ...createDefaultReaderPreferences(), fontSize: 18 } });
    state = readerAppReducer(state, { type: 'openDrawer', drawer: 'settings' });
    state = readerAppReducer(state, { type: 'previewPreferences', patch: { fontSize: 22, lineHeight: 2 } });
    expect(state.drawer).toBe('settings');
    expect(state.preferencesDraft).toMatchObject({ fontSize: 22, lineHeight: 2 });
    state = readerAppReducer(state, { type: 'preferencesSaved' });
    expect(state.preferences).toMatchObject({ fontSize: 22, lineHeight: 2 });
    expect(readerAppReducer(state, { type: 'resetPreferences' }).preferencesDraft).toEqual(createDefaultReaderPreferences());
    expect(readerAppReducer(state, { type: 'closeDrawer' }).drawer).toBeUndefined();
  });

  it('shows a non-blocking navigation notice without turning the reader into an error state', () => {
    const initial = readerAppReducer(createInitialReaderAppState(), { type: 'openReader', book: book('epub-1', 'epub'), requestId: 'r1' });
    const noticed = readerAppReducer(initial, { type: 'showNotice', message: '目标位置不可用' });
    expect(noticed.status).toBe('loading');
    expect(noticed.notice).toBe('目标位置不可用');
    expect(noticed.error).toBeUndefined();
    const laidOut = readerAppReducer(noticed, {
      type: 'layoutChanged', sectionId: 'one', pageIndex: 0, pageCount: 1, progression: 0,
      startOffset: 0, endOffset: 5, canPreviousPage: false, canNextPage: false, isSectionStart: true, isSectionEnd: true
    });
    expect(laidOut.notice).toBe('目标位置不可用');
  });
});
