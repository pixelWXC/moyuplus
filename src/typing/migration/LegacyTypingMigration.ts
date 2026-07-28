import { BookLibraryStore } from '../../storage/bookLibraryStore';
import type { StateMemento } from '../../storage/memento';
import {
  TYPING_PRACTICE_SESSION_KEY,
  TXT_LIBRARY_KEY
} from '../../storage/storageKeys';

export const LEGACY_TYPING_RESUME_HINT_KEY =
  'moyuplus.typingLegacyResumeHint.v1';
export const LEGACY_TYPING_MIGRATION_KEY =
  'moyuplus.typingMigration.v1';

export interface LegacyResumeHint {
  readonly schemaVersion: 1;
  readonly source: {
    readonly legacyFileId: string;
    readonly bookId?: string;
    readonly title: string;
    readonly available: boolean;
  };
  readonly physicalLineIndex: number;
  readonly whitespace: {
    readonly skipEmptyLines: boolean;
    readonly trimLeadingSpaces: boolean;
    readonly trimTrailingSpaces: boolean;
    readonly ignoreAllSpaces: boolean;
  };
  readonly createdAt: number;
}

export type LegacyTypingMigrationOutcome =
  | 'hintCreated'
  | 'noActiveSession';

export interface LegacyTypingMigrationReport {
  readonly status: 'migrated' | 'alreadyMigrated';
  readonly outcome: LegacyTypingMigrationOutcome;
}

export interface LegacyTypingMigrationOptions {
  readonly now?: () => number;
}

interface LegacyTypingMigrationMarker {
  readonly schemaVersion: 1;
  readonly completedAt: number;
  readonly outcome: LegacyTypingMigrationOutcome;
}

interface LegacyTypingSession {
  readonly fileId: string;
  readonly physicalLineIndex: number;
  readonly whitespace: LegacyResumeHint['whitespace'];
}

interface LegacyTxtFile {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
}

export async function migrateLegacyTypingSession(
  globalState: StateMemento,
  workspaceState: StateMemento,
  options: LegacyTypingMigrationOptions = {}
): Promise<LegacyTypingMigrationReport> {
  const existingMarker = normalizeMarker(
    workspaceState.get<unknown>(LEGACY_TYPING_MIGRATION_KEY)
  );
  if (existingMarker) {
    if (workspaceState.get<unknown>(TYPING_PRACTICE_SESSION_KEY) !== undefined) {
      await workspaceState.update(TYPING_PRACTICE_SESSION_KEY, undefined);
    }
    return {
      status: 'alreadyMigrated',
      outcome: existingMarker.outcome
    };
  }

  const now = options.now ?? Date.now;
  const legacySession = normalizeActiveLegacySession(
    workspaceState.get<unknown>(TYPING_PRACTICE_SESSION_KEY)
  );
  const outcome: LegacyTypingMigrationOutcome = legacySession
    ? 'hintCreated'
    : 'noActiveSession';

  if (legacySession) {
    const hint = createResumeHint(globalState, legacySession, now());
    await workspaceState.update(LEGACY_TYPING_RESUME_HINT_KEY, hint);
    const verifiedHint = normalizeLegacyResumeHint(
      workspaceState.get<unknown>(LEGACY_TYPING_RESUME_HINT_KEY)
    );
    if (!verifiedHint || !sameResumeHint(verifiedHint, hint)) {
      throw new Error(
        'Legacy typing resume hint verification failed after write.'
      );
    }
  }

  const marker: LegacyTypingMigrationMarker = {
    schemaVersion: 1,
    completedAt: now(),
    outcome
  };
  await workspaceState.update(LEGACY_TYPING_MIGRATION_KEY, marker);
  const verifiedMarker = normalizeMarker(
    workspaceState.get<unknown>(LEGACY_TYPING_MIGRATION_KEY)
  );
  if (!verifiedMarker || !sameMarker(verifiedMarker, marker)) {
    throw new Error(
      'Legacy typing migration marker verification failed after write.'
    );
  }

  await workspaceState.update(TYPING_PRACTICE_SESSION_KEY, undefined);
  return { status: 'migrated', outcome };
}

export function readLegacyResumeHint(
  workspaceState: StateMemento
): LegacyResumeHint | undefined {
  return normalizeLegacyResumeHint(
    workspaceState.get<unknown>(LEGACY_TYPING_RESUME_HINT_KEY)
  );
}

export async function dismissLegacyResumeHint(
  workspaceState: StateMemento
): Promise<void> {
  await workspaceState.update(LEGACY_TYPING_RESUME_HINT_KEY, undefined);
}

export function normalizeLegacyResumeHint(
  value: unknown
): LegacyResumeHint | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.source) ||
    !isNonEmptyString(value.source.legacyFileId) ||
    !isNonEmptyString(value.source.title) ||
    typeof value.source.available !== 'boolean' ||
    !isNonNegativeInteger(value.physicalLineIndex) ||
    !isRecord(value.whitespace) ||
    !hasBooleanWhitespace(value.whitespace) ||
    !isNonNegativeFiniteNumber(value.createdAt)
  ) {
    return undefined;
  }

  const bookId = value.source.bookId;
  if (
    (bookId !== undefined && !isNonEmptyString(bookId)) ||
    (value.source.available && bookId === undefined) ||
    (!value.source.available && bookId !== undefined)
  ) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    source: {
      legacyFileId: value.source.legacyFileId,
      ...(bookId === undefined ? {} : { bookId }),
      title: value.source.title,
      available: value.source.available
    },
    physicalLineIndex: value.physicalLineIndex,
    whitespace: {
      skipEmptyLines: value.whitespace.skipEmptyLines,
      trimLeadingSpaces: value.whitespace.trimLeadingSpaces,
      trimTrailingSpaces: value.whitespace.trimTrailingSpaces,
      ignoreAllSpaces: value.whitespace.ignoreAllSpaces
    },
    createdAt: value.createdAt
  };
}

function createResumeHint(
  globalState: StateMemento,
  session: LegacyTypingSession,
  createdAt: number
): LegacyResumeHint {
  const legacyFiles = globalState.get<unknown>(TXT_LIBRARY_KEY);
  const legacyFile = Array.isArray(legacyFiles)
    ? legacyFiles
      .map(normalizeLegacyTxtFile)
      .find((entry): entry is LegacyTxtFile => entry?.id === session.fileId)
    : undefined;
  const mappedBook = legacyFile
    ? new BookLibraryStore(globalState).getByUri(legacyFile.uri)
    : undefined;
  const available = Boolean(
    mappedBook?.format === 'txt' && mappedBook.capabilities.typing
  );

  return {
    schemaVersion: 1,
    source: {
      legacyFileId: session.fileId,
      ...(available && mappedBook ? { bookId: mappedBook.id } : {}),
      title: legacyFile?.name ?? session.fileId,
      available
    },
    physicalLineIndex: session.physicalLineIndex,
    whitespace: session.whitespace,
    createdAt
  };
}

function normalizeActiveLegacySession(
  value: unknown
): LegacyTypingSession | undefined {
  if (
    !isRecord(value) ||
    value.active !== true ||
    !isNonEmptyString(value.fileId)
  ) {
    return undefined;
  }
  return {
    fileId: value.fileId,
    physicalLineIndex: isNonNegativeFiniteNumber(value.lineIndex)
      ? Math.floor(value.lineIndex)
      : 0,
    whitespace: {
      skipEmptyLines: booleanOr(value.skipEmptyLines, true),
      trimLeadingSpaces: booleanOr(value.trimLeadingSpaces, false),
      trimTrailingSpaces: booleanOr(value.trimTrailingSpaces, false),
      ignoreAllSpaces: booleanOr(value.ignoreAllSpaces, false)
    }
  };
}

function normalizeLegacyTxtFile(value: unknown): LegacyTxtFile | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.uri)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    uri: value.uri
  };
}

function normalizeMarker(
  value: unknown
): LegacyTypingMigrationMarker | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isNonNegativeFiniteNumber(value.completedAt) ||
    !isMigrationOutcome(value.outcome)
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    completedAt: value.completedAt,
    outcome: value.outcome
  };
}

function sameResumeHint(
  actual: LegacyResumeHint,
  expected: LegacyResumeHint
): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sameMarker(
  actual: LegacyTypingMigrationMarker,
  expected: LegacyTypingMigrationMarker
): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function hasBooleanWhitespace(
  value: Record<string, unknown>
): value is Record<string, boolean> {
  return (
    typeof value.skipEmptyLines === 'boolean' &&
    typeof value.trimLeadingSpaces === 'boolean' &&
    typeof value.trimTrailingSpaces === 'boolean' &&
    typeof value.ignoreAllSpaces === 'boolean'
  );
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isMigrationOutcome(
  value: unknown
): value is LegacyTypingMigrationOutcome {
  return value === 'hintCreated' || value === 'noActiveSession';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFiniteNumber(value) && Number.isInteger(value);
}
