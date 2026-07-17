import type { BookRecord } from '../domain/books';
import type { TocNode, SectionRef } from '../adapters/bookAdapter';
import { createDefaultReaderPreferences, normalizeReaderPreferences, type ReaderPreferences } from '../domain/readerPreferences';
import type { LayoutState } from './layoutEngine';

export const REMOVE_BOOK_CONFIRMATION = '仅从 MoyuPlus 书架移除，不会删除原文件。';

export type LibraryBookAction = 'open' | 'startImmersive' | 'stopImmersive' | 'startTypingPractice' | 'relocate' | 'remove';

export type LibraryBookItem = BookRecord & {
  available: boolean;
  status: 'available' | 'missing';
  progress: number;
  immersiveActive: boolean;
};

export interface ReaderAppState {
  view: 'library' | 'reader';
  status: 'loading' | 'ready' | 'error';
  libraryRevision: number;
  books: LibraryBookItem[];
  pendingRemoval?: { bookId: string; message: string };
  error?: string;
  activeBook?: BookRecord;
  requestId?: string;
  toc?: TocNode[];
  sections?: SectionRef[];
  activeSectionId?: string;
  initialProgression?: number;
  layout?: LayoutState;
  navigation?: ReaderNavigation;
  drawer?: 'toc';
  notice?: string;
  preferences: ReaderPreferences;
}

export interface ReaderNavigation {
  canPreviousPage: boolean;
  canNextPage: boolean;
  canPreviousSection: boolean;
  canNextSection: boolean;
}

export type ReaderAppAction =
  | {
      type: 'libraryLoaded';
      books: BookRecord[];
      availability: Record<string, boolean>;
      progress: Record<string, number>;
      immersiveBookId?: string;
      libraryRevision: number;
    }
  | { type: 'requestRemove'; bookId: string }
  | { type: 'cancelRemove' }
  | { type: 'bookRemoved'; bookId: string }
  | { type: 'showError'; message: string }
  | { type: 'showNotice'; message: string }
  | { type: 'clearNotice' }
  | { type: 'openReader'; book: BookRecord; requestId: string }
  | { type: 'closeReader' }
  | { type: 'bookReady'; requestId: string; toc: TocNode[]; sections: SectionRef[]; initialSectionId: string; initialProgression?: number }
  | ({ type: 'layoutChanged' } & LayoutState)
  | { type: 'selectSection'; sectionId: string }
  | { type: 'openDrawer'; drawer: 'toc' }
  | { type: 'closeDrawer' }
  | { type: 'bookBoundary'; edge: 'start' | 'end' }
  | { type: 'preferencesLoaded'; preferences: ReaderPreferences };

export function createInitialReaderAppState(): ReaderAppState {
  const preferences = createDefaultReaderPreferences();
  return { view: 'library', status: 'loading', libraryRevision: 0, books: [], preferences };
}

export function readerAppReducer(state: ReaderAppState, action: ReaderAppAction): ReaderAppState {
  switch (action.type) {
    case 'libraryLoaded': {
      if (!Number.isSafeInteger(action.libraryRevision) || action.libraryRevision <= 0
        || action.libraryRevision <= state.libraryRevision) return state;
      const books = action.books.map(book => {
        const available = action.availability[book.id] !== false;
        return {
          ...book,
          available,
          status: available ? 'available' as const : 'missing' as const,
          progress: normalizeProgress(action.progress[book.id]),
          immersiveActive: book.id === action.immersiveBookId
        };
      });
      return {
        ...state,
        view: 'library',
        status: 'ready',
        libraryRevision: action.libraryRevision,
        books,
        pendingRemoval: state.pendingRemoval && books.some(book => book.id === state.pendingRemoval?.bookId)
          ? state.pendingRemoval
          : undefined
      };
    }
    case 'requestRemove':
      return { ...state, pendingRemoval: { bookId: action.bookId, message: REMOVE_BOOK_CONFIRMATION } };
    case 'cancelRemove': {
      const { pendingRemoval: _pendingRemoval, ...next } = state;
      return next;
    }
    case 'bookRemoved':
      return {
        ...state,
        books: state.books.filter(book => book.id !== action.bookId),
        pendingRemoval: undefined
      };
    case 'showError':
      return { ...state, status: 'error', error: action.message };
    case 'showNotice':
      return { ...state, notice: action.message };
    case 'clearNotice':
      return { ...state, notice: undefined };
    case 'openReader':
      return { ...state, view: 'reader', status: 'loading', activeBook: action.book, requestId: action.requestId, notice: undefined };
    case 'closeReader':
      return { ...state, view: 'library', status: 'ready', activeBook: undefined, requestId: undefined, toc: undefined, sections: undefined, activeSectionId: undefined, initialProgression: undefined, layout: undefined, navigation: undefined, drawer: undefined, notice: undefined };
    case 'bookReady':
      if (state.requestId !== action.requestId) return state;
      return { ...state, toc: action.toc, sections: action.sections, activeSectionId: action.initialSectionId, initialProgression: action.initialProgression, status: 'loading', navigation: navigationFor(action.sections, action.initialSectionId) };
    case 'selectSection':
      return { ...state, activeSectionId: action.sectionId, status: 'loading', drawer: undefined, notice: undefined, navigation: navigationFor(state.sections ?? [], action.sectionId) };
    case 'layoutChanged': {
      const chapter = navigationFor(state.sections ?? [], action.sectionId);
      return { ...state, status: 'ready', activeSectionId: action.sectionId, layout: action, navigation: {
        ...chapter,
        canPreviousPage: action.canPreviousPage || chapter.canPreviousSection,
        canNextPage: action.canNextPage || chapter.canNextSection
      } };
    }
    case 'openDrawer': return { ...state, drawer: action.drawer };
    case 'closeDrawer': return { ...state, drawer: undefined };
    case 'bookBoundary': return { ...state, notice: action.edge === 'start' ? '已到本书开头' : '已读完本书' };
    case 'preferencesLoaded': {
      const preferences = normalizeReaderPreferences(action.preferences);
      return { ...state, preferences };
    }
  }
}

function navigationFor(sections: SectionRef[], sectionId: string): ReaderNavigation {
  const index = sections.findIndex(section => section.id === sectionId);
  return { canPreviousPage: false, canNextPage: false, canPreviousSection: index > 0, canNextSection: index >= 0 && index < sections.length - 1 };
}

export function getLibraryBookActions(book: LibraryBookItem): LibraryBookAction[] {
  return [
    'open',
    book.immersiveActive ? 'stopImmersive' : 'startImmersive',
    ...(book.capabilities.typing ? ['startTypingPractice' as const] : []),
    'relocate',
    'remove'
  ];
}

function normalizeProgress(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
