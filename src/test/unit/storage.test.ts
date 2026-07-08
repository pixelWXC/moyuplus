import { describe, expect, it } from 'vitest';
import {
  createDefaultReaderSession,
  createDefaultShortcutConfig,
  createDefaultTypingPracticeSession,
  type ImportedTxtFile,
  type ReaderSession,
  type TypingPracticeSession
} from '../../domain/models';
import { TXT_LIBRARY_KEY, READER_SESSION_KEY, TYPING_PRACTICE_SESSION_KEY } from '../../storage/storageKeys';
import { TxtLibraryStore } from '../../storage/txtLibraryStore';
import { WorkspaceSessionStore } from '../../storage/workspaceSessionStore';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initialValues: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

function sampleFile(overrides: Partial<ImportedTxtFile> = {}): ImportedTxtFile {
  const now = 1_788_888_888_000;

  return {
    id: 'file-1',
    name: 'book.txt',
    uri: 'file:///workspace/book.txt',
    encoding: 'utf8',
    source: 'workspace',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe('domain model defaults', () => {
  it('creates safe default reader, typing, and shortcut state', () => {
    expect(createDefaultReaderSession()).toEqual({
      active: false,
      offset: 0,
      approximatePercent: 0,
      fontSize: 16,
      lineHeight: 1.6,
      pageHistory: []
    });

    expect(createDefaultTypingPracticeSession()).toEqual({
      active: false,
      lineIndex: 0,
      totalLines: 0,
      skipEmptyLines: true,
      trimLeadingSpaces: false,
      ignoreAllSpaces: false,
      tabMode: 'completeRest',
      enterBehavior: {
        insertNewLine: true,
        nextPracticeLine: false,
        nextReaderPage: false
      }
    });

    expect(createDefaultShortcutConfig()).toEqual({});
  });
});

describe('TxtLibraryStore', () => {
  it('reads an empty library when no global state exists', () => {
    const store = new TxtLibraryStore(new MemoryMemento());

    expect(store.list()).toEqual([]);
    expect(store.getById('missing')).toBeUndefined();
  });

  it('adds, updates, and removes imported TXT files in global state', async () => {
    const state = new MemoryMemento();
    const store = new TxtLibraryStore(state);
    const first = sampleFile();
    const updated = sampleFile({
      name: 'renamed.txt',
      encoding: 'gbk',
      updatedAt: first.updatedAt + 1,
      lastOpenedAt: first.updatedAt + 2
    });

    await store.upsert(first);
    expect(store.list()).toEqual([first]);
    expect(state.get(TXT_LIBRARY_KEY)).toEqual([first]);

    await store.upsert(updated);
    expect(store.list()).toEqual([updated]);
    expect(store.getById(first.id)).toEqual(updated);

    await store.upsert(sampleFile({ id: 'file-2', name: 'other.txt' }));
    expect(store.list().map((file) => file.id)).toEqual(['file-1', 'file-2']);

    await store.remove('file-1');
    expect(store.list().map((file) => file.id)).toEqual(['file-2']);
  });

  it('recovers from damaged global library state without throwing', () => {
    const state = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [
        sampleFile({ id: 'valid' }),
        { id: 'bad', name: 'missing fields' },
        null,
        'not a file'
      ]
    });
    const store = new TxtLibraryStore(state);

    expect(store.list()).toEqual([sampleFile({ id: 'valid' })]);
  });
});

describe('WorkspaceSessionStore', () => {
  it('returns default workspace sessions for an empty workspace state', () => {
    const store = new WorkspaceSessionStore(new MemoryMemento());

    expect(store.getReaderSession()).toEqual(createDefaultReaderSession());
    expect(store.getTypingPracticeSession()).toEqual(createDefaultTypingPracticeSession());
  });

  it('saves reader and typing sessions independently', async () => {
    const state = new MemoryMemento();
    const store = new WorkspaceSessionStore(state);
    const readerSession: ReaderSession = {
      ...createDefaultReaderSession(),
      active: true,
      fileId: 'reader-file',
      offset: 120,
      approximatePercent: 0.25,
      pageHistory: [{ startOffset: 0, endOffset: 120 }]
    };
    const typingSession: TypingPracticeSession = {
      ...createDefaultTypingPracticeSession(),
      active: true,
      fileId: 'typing-file',
      lineIndex: 8,
      totalLines: 100,
      tabMode: 'replaceLine',
      enterBehavior: {
        insertNewLine: true,
        nextPracticeLine: true,
        nextReaderPage: false
      }
    };

    await store.saveReaderSession(readerSession);
    expect(store.getReaderSession()).toEqual(readerSession);
    expect(store.getTypingPracticeSession()).toEqual(createDefaultTypingPracticeSession());
    expect(state.get(READER_SESSION_KEY)).toEqual(readerSession);

    await store.saveTypingPracticeSession(typingSession);
    expect(store.getReaderSession()).toEqual(readerSession);
    expect(store.getTypingPracticeSession()).toEqual(typingSession);
    expect(state.get(TYPING_PRACTICE_SESSION_KEY)).toEqual(typingSession);
  });

  it('merges older partial session shapes with defaults and clamps unsafe numbers', () => {
    const store = new WorkspaceSessionStore(
      new MemoryMemento({
        [READER_SESSION_KEY]: {
          active: true,
          fileId: 'reader-file',
          offset: -10,
          fontSize: 0,
          pageHistory: [{ startOffset: 40, endOffset: 20 }, { startOffset: 20, endOffset: 40 }]
        },
        [TYPING_PRACTICE_SESSION_KEY]: {
          active: true,
          fileId: 'typing-file',
          lineIndex: -2,
          totalLines: -100,
          tabMode: 'unknown'
        }
      })
    );

    expect(store.getReaderSession()).toEqual({
      ...createDefaultReaderSession(),
      active: true,
      fileId: 'reader-file',
      pageHistory: [{ startOffset: 20, endOffset: 40 }]
    });
    expect(store.getTypingPracticeSession()).toEqual({
      ...createDefaultTypingPracticeSession(),
      active: true,
      fileId: 'typing-file'
    });
  });

  it('recovers from completely damaged workspace state', () => {
    const store = new WorkspaceSessionStore(
      new MemoryMemento({
        [READER_SESSION_KEY]: 'bad',
        [TYPING_PRACTICE_SESSION_KEY]: null
      })
    );

    expect(store.getReaderSession()).toEqual(createDefaultReaderSession());
    expect(store.getTypingPracticeSession()).toEqual(createDefaultTypingPracticeSession());
  });
});
