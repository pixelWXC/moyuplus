import {
  createBookCapabilities,
  createBookId as createRandomBookId,
  normalizeBookRecord,
  type BookRecord
} from '../../domain/books';
import { normalizeImportedTxtFile, normalizeReaderSession } from '../../domain/models';
import { BookLibraryStore } from '../bookLibraryStore';
import type { StateMemento } from '../memento';
import { ReadingProgressStore } from '../readingProgressStore';
import {
  READER_SESSION_KEY,
  READER_V2_MIGRATION_KEY,
  TXT_LIBRARY_KEY
} from '../storageKeys';

export type MigrationSkipReason = 'invalidLegacyBook' | 'invalidBookUri';

export interface MigrationSkip {
  readonly index: number;
  readonly reason: MigrationSkipReason;
}

export interface ReaderV2MigrationReport {
  readonly status: 'migrated' | 'alreadyMigrated';
  readonly migratedBooks: number;
  readonly migratedProgress: number;
  readonly skipped: readonly MigrationSkip[];
}

export interface ReaderV2MigrationOptions {
  readonly createBookId?: () => string;
  readonly now?: () => number;
}

export async function migrateV1ToV2(
  globalState: StateMemento,
  workspaceState: StateMemento,
  options: ReaderV2MigrationOptions = {}
): Promise<ReaderV2MigrationReport> {
  const marker = normalizeMarker(globalState.get<unknown>(READER_V2_MIGRATION_KEY));
  if (marker) {
    return {
      status: 'alreadyMigrated',
      migratedBooks: marker.migratedBooks,
      migratedProgress: marker.migratedProgress,
      skipped: []
    };
  }

  const now = options.now ?? Date.now;
  const generateBookId = options.createBookId ?? createRandomBookId;
  const bookStore = new BookLibraryStore(globalState);
  const progressStore = new ReadingProgressStore(globalState);
  const migratedByLegacyId = new Map<string, BookRecord>();
  const migratedBookIds = new Set<string>();
  const skipped: MigrationSkip[] = [];
  const legacyValue = globalState.get<unknown>(TXT_LIBRARY_KEY);
  const legacyEntries = Array.isArray(legacyValue) ? legacyValue : [];

  for (const [index, entry] of legacyEntries.entries()) {
    const legacyBook = normalizeImportedTxtFile(entry);
    if (!legacyBook) {
      skipped.push({ index, reason: 'invalidLegacyBook' });
      continue;
    }

    let migratedBook = bookStore.getByUri(legacyBook.uri);
    if (!migratedBook) {
      const candidate = normalizeBookRecord({
        schemaVersion: 2,
        id: generateBookId(),
        uri: legacyBook.uri,
        source: legacyBook.source,
        title: legacyBook.name,
        authors: [],
        capabilities: createBookCapabilities('txt'),
        createdAt: legacyBook.createdAt,
        updatedAt: legacyBook.updatedAt,
        ...(legacyBook.lastOpenedAt === undefined ? {} : { lastOpenedAt: legacyBook.lastOpenedAt }),
        format: 'txt',
        formatData: { encoding: legacyBook.encoding }
      });
      if (!candidate) {
        skipped.push({ index, reason: 'invalidBookUri' });
        continue;
      }
      await bookStore.upsert(candidate);
      migratedBook = bookStore.getByUri(legacyBook.uri);
      if (!migratedBook) {
        throw new Error('Reader v2 book migration verification failed after write.');
      }
    }

    migratedByLegacyId.set(legacyBook.id, migratedBook);
    migratedBookIds.add(migratedBook.id);
  }

  let migratedProgress = 0;
  const legacySession = normalizeReaderSession(workspaceState.get<unknown>(READER_SESSION_KEY));
  const progressBook = legacySession.fileId ? migratedByLegacyId.get(legacySession.fileId) : undefined;
  if (progressBook) {
    const progression = legacySession.approximatePercent;
    await progressStore.save({
      bookId: progressBook.id,
      locator: {
        kind: 'txt',
        sectionId: 'txt:0',
        progression,
        offset: legacySession.offset
      },
      bookProgression: progression,
      updatedAt: now()
    });
    migratedProgress = 1;
  }

  const booksVerified = [...migratedBookIds].every((bookId) => bookStore.get(bookId) !== undefined);
  const progressVerified = !progressBook || progressStore.get(progressBook.id) !== undefined;
  if (!booksVerified || !progressVerified) {
    throw new Error('Reader v2 migration verification failed during readback.');
  }

  const completedAt = now();
  await globalState.update(READER_V2_MIGRATION_KEY, {
    completedAt,
    migratedBooks: migratedBookIds.size,
    migratedProgress
  });

  return {
    status: 'migrated',
    migratedBooks: migratedBookIds.size,
    migratedProgress,
    skipped
  };
}

interface MigrationMarker {
  readonly completedAt: number;
  readonly migratedBooks: number;
  readonly migratedProgress: number;
}

function normalizeMarker(value: unknown): MigrationMarker | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    !isNonNegativeFiniteNumber(value.completedAt) ||
    !isNonNegativeFiniteNumber(value.migratedBooks) ||
    !isNonNegativeFiniteNumber(value.migratedProgress)
  ) {
    return undefined;
  }
  return {
    completedAt: value.completedAt,
    migratedBooks: value.migratedBooks,
    migratedProgress: value.migratedProgress
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
