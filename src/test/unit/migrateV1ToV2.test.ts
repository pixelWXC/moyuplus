import { describe, expect, it } from 'vitest';
import { migrateV1ToV2 } from '../../storage/migrations/migrateV1ToV2';
import {
  BOOK_LIBRARY_KEY,
  READER_SESSION_KEY,
  READER_V2_MIGRATION_KEY,
  READING_PROGRESS_KEY,
  TXT_LIBRARY_KEY
} from '../../storage/storageKeys';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(
    initialValues: Record<string, unknown> = {},
    private readonly failUpdateKey?: string,
    private readonly hideReadKey?: string
  ) {
    Object.entries(initialValues).forEach(([key, value]) => this.values.set(key, value));
  }

  get<T>(key: string): T | undefined {
    if (key === this.hideReadKey) {
      return undefined;
    }
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (key === this.failUpdateKey) {
      throw new Error(`update failed for ${key}`);
    }
    this.values.set(key, value);
  }

  raw(key: string): unknown {
    return this.values.get(key);
  }
}

const timestamp = 1_788_888_888_000;

function legacyFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'legacy-1',
    name: 'legacy.txt',
    uri: 'file:///books/legacy.txt',
    encoding: 'gbk',
    source: 'workspace',
    createdAt: timestamp - 100,
    updatedAt: timestamp - 50,
    ...overrides
  };
}

function legacyReaderSession(): Record<string, unknown> {
  return {
    active: true,
    fileId: 'legacy-1',
    offset: 250,
    approximatePercent: 0.25,
    fontSize: 16,
    lineHeight: 1.6,
    pageHistory: []
  };
}

describe('migrateV1ToV2', () => {
  it('converts legacy TXT records and the active Reader offset into v2 stores', async () => {
    const globalState = new MemoryMemento({ [TXT_LIBRARY_KEY]: [legacyFile()] });
    const workspaceState = new MemoryMemento({ [READER_SESSION_KEY]: legacyReaderSession() });

    const report = await migrateV1ToV2(globalState, workspaceState, {
      createBookId: () => 'book-v2-1',
      now: () => timestamp
    });

    expect(report).toMatchObject({ status: 'migrated', migratedBooks: 1, migratedProgress: 1, skipped: [] });
    expect(globalState.raw(BOOK_LIBRARY_KEY)).toEqual([
      {
        schemaVersion: 2,
        id: 'book-v2-1',
        uri: 'file:///books/legacy.txt',
        source: 'workspace',
        title: 'legacy.txt',
        authors: [],
        capabilities: { readable: true, typing: true, toc: true },
        createdAt: timestamp - 100,
        updatedAt: timestamp - 50,
        format: 'txt',
        formatData: { encoding: 'gbk' }
      }
    ]);
    expect(globalState.raw(READING_PROGRESS_KEY)).toEqual([
      {
        bookId: 'book-v2-1',
        locator: { kind: 'txt', sectionId: 'txt:0', progression: 0.25, offset: 250 },
        bookProgression: 0.25,
        updatedAt: timestamp
      }
    ]);
    expect(globalState.raw(READER_V2_MIGRATION_KEY)).toEqual({
      completedAt: timestamp,
      migratedBooks: 1,
      migratedProgress: 1
    });
  });

  it('skips and reports damaged records without failing valid migration work', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [legacyFile(), { id: 'bad' }, legacyFile({ id: 'bad-uri', uri: 'not a URI' })]
    });
    const workspaceState = new MemoryMemento();

    const report = await migrateV1ToV2(globalState, workspaceState, {
      createBookId: () => 'book-v2-1',
      now: () => timestamp
    });

    expect(report.migratedBooks).toBe(1);
    expect(report.skipped).toEqual([
      { index: 1, reason: 'invalidLegacyBook' },
      { index: 2, reason: 'invalidBookUri' }
    ]);
  });

  it('does not write the marker when v2 writes or readback verification fail and preserves legacy keys', async () => {
    const failingGlobal = new MemoryMemento(
      { [TXT_LIBRARY_KEY]: [legacyFile()] },
      READING_PROGRESS_KEY
    );
    const workspaceState = new MemoryMemento({ [READER_SESSION_KEY]: legacyReaderSession() });

    await expect(
      migrateV1ToV2(failingGlobal, workspaceState, {
        createBookId: () => 'book-v2-1',
        now: () => timestamp
      })
    ).rejects.toThrow('update failed');
    expect(failingGlobal.raw(READER_V2_MIGRATION_KEY)).toBeUndefined();
    expect(failingGlobal.raw(TXT_LIBRARY_KEY)).toEqual([legacyFile()]);
    expect(workspaceState.raw(READER_SESSION_KEY)).toEqual(legacyReaderSession());

    const hiddenReadback = new MemoryMemento(
      { [TXT_LIBRARY_KEY]: [legacyFile()] },
      undefined,
      BOOK_LIBRARY_KEY
    );
    await expect(
      migrateV1ToV2(hiddenReadback, new MemoryMemento(), {
        createBookId: () => 'book-v2-1',
        now: () => timestamp
      })
    ).rejects.toThrow('verification');
    expect(hiddenReadback.raw(READER_V2_MIGRATION_KEY)).toBeUndefined();
  });

  it('is idempotent and does not generate duplicate books on repeated execution', async () => {
    const globalState = new MemoryMemento({ [TXT_LIBRARY_KEY]: [legacyFile()] });
    const workspaceState = new MemoryMemento({ [READER_SESSION_KEY]: legacyReaderSession() });
    let generatedIds = 0;
    const options = {
      createBookId: () => `book-v2-${++generatedIds}`,
      now: () => timestamp
    };

    await migrateV1ToV2(globalState, workspaceState, options);
    const second = await migrateV1ToV2(globalState, workspaceState, options);

    expect(second.status).toBe('alreadyMigrated');
    expect(globalState.raw(BOOK_LIBRARY_KEY)).toHaveLength(1);
    expect(globalState.raw(READING_PROGRESS_KEY)).toHaveLength(1);
    expect(generatedIds).toBe(1);
  });
});
