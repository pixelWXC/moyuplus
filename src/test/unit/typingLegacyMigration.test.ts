import { describe, expect, it } from 'vitest';
import {
  LEGACY_TYPING_MIGRATION_KEY,
  LEGACY_TYPING_RESUME_HINT_KEY,
  migrateLegacyTypingSession
} from '../../typing/migration';
import {
  BOOK_LIBRARY_KEY,
  TYPING_PRACTICE_SESSION_KEY,
  TXT_LIBRARY_KEY
} from '../../storage/storageKeys';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(
    initialValues: Record<string, unknown> = {},
    private readonly failUpdateKey?: string,
    private readonly hideReadKey?: string
  ) {
    Object.entries(initialValues).forEach(([key, value]) => {
      this.values.set(key, value);
    });
  }

  get<T>(key: string): T | undefined {
    if (key === this.hideReadKey) return undefined;
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (key === this.failUpdateKey) {
      throw new Error(`update failed for ${key}`);
    }
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }

  raw(key: string): unknown {
    return this.values.get(key);
  }
}

const now = 1_790_000_000_000;

function legacySession(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    fileId: 'legacy-file-1',
    lineIndex: 7,
    totalLines: 20,
    skipEmptyLines: true,
    trimLeadingSpaces: true,
    trimTrailingSpaces: false,
    ignoreAllSpaces: false,
    tabMode: 'completeRest',
    enterBehavior: {
      insertNewLine: true,
      nextPracticeLine: false,
      nextReaderPage: false
    },
    ...overrides
  };
}

function legacyFile() {
  return {
    id: 'legacy-file-1',
    name: '旧练习.txt',
    uri: 'file:///books/legacy.txt',
    encoding: 'utf8',
    source: 'external',
    createdAt: now - 200,
    updatedAt: now - 100
  };
}

function migratedBook() {
  return {
    schemaVersion: 2,
    id: 'book-v2-1',
    uri: 'file:///books/legacy.txt',
    source: 'external',
    title: '旧练习',
    authors: [],
    capabilities: {
      readable: true,
      typing: true,
      toc: true
    },
    format: 'txt',
    formatData: {
      encoding: 'utf8'
    },
    createdAt: now - 200,
    updatedAt: now - 100
  };
}

describe('legacy typing session migration', () => {
  it('creates one safe resume hint without fabricating a result or session', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [legacyFile()],
      [BOOK_LIBRARY_KEY]: [migratedBook()]
    });
    const workspaceState = new MemoryMemento({
      [TYPING_PRACTICE_SESSION_KEY]: legacySession()
    });

    const report = await migrateLegacyTypingSession(
      globalState,
      workspaceState,
      { now: () => now }
    );

    expect(report).toEqual({
      status: 'migrated',
      outcome: 'hintCreated'
    });
    expect(workspaceState.raw(LEGACY_TYPING_RESUME_HINT_KEY)).toEqual({
      schemaVersion: 1,
      source: {
        legacyFileId: 'legacy-file-1',
        bookId: 'book-v2-1',
        title: '旧练习.txt',
        available: true
      },
      physicalLineIndex: 7,
      whitespace: {
        skipEmptyLines: true,
        trimLeadingSpaces: true,
        trimTrailingSpaces: false,
        ignoreAllSpaces: false
      },
      createdAt: now
    });
    expect(workspaceState.raw(LEGACY_TYPING_MIGRATION_KEY)).toEqual({
      schemaVersion: 1,
      completedAt: now,
      outcome: 'hintCreated'
    });
    expect(workspaceState.raw(TYPING_PRACTICE_SESSION_KEY)).toBeUndefined();
    expect(globalState.raw('results')).toBeUndefined();
  });

  it('records an unavailable source hint without guessing a v2 book id', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [legacyFile()]
    });
    const workspaceState = new MemoryMemento({
      [TYPING_PRACTICE_SESSION_KEY]: legacySession()
    });

    await migrateLegacyTypingSession(globalState, workspaceState, {
      now: () => now
    });

    expect(workspaceState.raw(LEGACY_TYPING_RESUME_HINT_KEY)).toEqual(
      expect.objectContaining({
        source: {
          legacyFileId: 'legacy-file-1',
          title: '旧练习.txt',
          available: false
        }
      })
    );
  });

  it('does not create a hint for an inactive legacy session', async () => {
    const workspaceState = new MemoryMemento({
      [TYPING_PRACTICE_SESSION_KEY]: legacySession({ active: false })
    });

    const report = await migrateLegacyTypingSession(
      new MemoryMemento(),
      workspaceState,
      { now: () => now }
    );

    expect(report).toEqual({
      status: 'migrated',
      outcome: 'noActiveSession'
    });
    expect(workspaceState.raw(LEGACY_TYPING_RESUME_HINT_KEY)).toBeUndefined();
    expect(workspaceState.raw(TYPING_PRACTICE_SESSION_KEY)).toBeUndefined();
  });

  it('is idempotent and never overwrites the first hint', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [legacyFile()],
      [BOOK_LIBRARY_KEY]: [migratedBook()]
    });
    const workspaceState = new MemoryMemento({
      [TYPING_PRACTICE_SESSION_KEY]: legacySession()
    });

    await migrateLegacyTypingSession(globalState, workspaceState, {
      now: () => now
    });
    const second = await migrateLegacyTypingSession(
      globalState,
      workspaceState,
      { now: () => now + 1_000 }
    );

    expect(second).toEqual({
      status: 'alreadyMigrated',
      outcome: 'hintCreated'
    });
    expect(workspaceState.raw(LEGACY_TYPING_RESUME_HINT_KEY)).toEqual(
      expect.objectContaining({ createdAt: now })
    );
  });

  it('preserves the old session and omits the marker when hint write or readback fails', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [legacyFile()],
      [BOOK_LIBRARY_KEY]: [migratedBook()]
    });
    const failedWrite = new MemoryMemento(
      { [TYPING_PRACTICE_SESSION_KEY]: legacySession() },
      LEGACY_TYPING_RESUME_HINT_KEY
    );

    await expect(migrateLegacyTypingSession(globalState, failedWrite))
      .rejects.toThrow('update failed');
    expect(failedWrite.raw(TYPING_PRACTICE_SESSION_KEY))
      .toEqual(legacySession());
    expect(failedWrite.raw(LEGACY_TYPING_MIGRATION_KEY)).toBeUndefined();

    const failedReadback = new MemoryMemento(
      { [TYPING_PRACTICE_SESSION_KEY]: legacySession() },
      undefined,
      LEGACY_TYPING_RESUME_HINT_KEY
    );
    await expect(migrateLegacyTypingSession(globalState, failedReadback))
      .rejects.toThrow('verification');
    expect(failedReadback.raw(TYPING_PRACTICE_SESSION_KEY))
      .toEqual(legacySession());
    expect(failedReadback.raw(LEGACY_TYPING_MIGRATION_KEY)).toBeUndefined();
  });

  it('preserves the old session when the completion marker cannot be committed', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [legacyFile()],
      [BOOK_LIBRARY_KEY]: [migratedBook()]
    });
    const workspaceState = new MemoryMemento(
      { [TYPING_PRACTICE_SESSION_KEY]: legacySession() },
      LEGACY_TYPING_MIGRATION_KEY
    );

    await expect(migrateLegacyTypingSession(globalState, workspaceState))
      .rejects.toThrow('update failed');

    expect(workspaceState.raw(TYPING_PRACTICE_SESSION_KEY))
      .toEqual(legacySession());
    expect(workspaceState.raw(LEGACY_TYPING_RESUME_HINT_KEY))
      .toEqual(expect.objectContaining({ schemaVersion: 1 }));
    expect(workspaceState.raw(LEGACY_TYPING_MIGRATION_KEY)).toBeUndefined();
  });

  it('retries old-session cleanup from a verified marker without replacing the hint', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [legacyFile()],
      [BOOK_LIBRARY_KEY]: [migratedBook()]
    });
    const failedCleanup = new MemoryMemento(
      { [TYPING_PRACTICE_SESSION_KEY]: legacySession() },
      TYPING_PRACTICE_SESSION_KEY
    );

    await expect(migrateLegacyTypingSession(
      globalState,
      failedCleanup,
      { now: () => now }
    )).rejects.toThrow('update failed');
    const firstHint = failedCleanup.raw(LEGACY_TYPING_RESUME_HINT_KEY);
    const recovered = new MemoryMemento({
      [TYPING_PRACTICE_SESSION_KEY]: legacySession(),
      [LEGACY_TYPING_RESUME_HINT_KEY]: firstHint,
      [LEGACY_TYPING_MIGRATION_KEY]:
        failedCleanup.raw(LEGACY_TYPING_MIGRATION_KEY)
    });

    await expect(migrateLegacyTypingSession(
      globalState,
      recovered,
      { now: () => now + 1_000 }
    )).resolves.toEqual({
      status: 'alreadyMigrated',
      outcome: 'hintCreated'
    });
    expect(recovered.raw(TYPING_PRACTICE_SESSION_KEY)).toBeUndefined();
    expect(recovered.raw(LEGACY_TYPING_RESUME_HINT_KEY)).toEqual(firstHint);
  });
});
