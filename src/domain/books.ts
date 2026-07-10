export const BOOK_SCHEMA_VERSION = 2 as const;

export type BookFormat = 'txt' | 'epub';
export type BookSource = 'workspace' | 'external';
export type TxtEncoding = 'utf8' | 'gbk';

export interface BookCapabilities {
  readable: true;
  typing: boolean;
  toc: boolean;
}

interface BookRecordBase {
  schemaVersion: typeof BOOK_SCHEMA_VERSION;
  id: string;
  uri: string;
  source: BookSource;
  title: string;
  authors: string[];
  capabilities: BookCapabilities;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
}

export type BookRecord = BookRecordBase &
  (
    | { format: 'txt'; formatData: { encoding: TxtEncoding } }
    | { format: 'epub'; formatData: { packageIdentifier?: string } }
  );

export function createBookCapabilities(_format: BookFormat): BookCapabilities {
  return {
    readable: true,
    typing: _format === 'txt',
    toc: true
  };
}

export function createBookId(): string {
  return randomUUID();
}

export function normalizeBookRecord(value: unknown): BookRecord | undefined {
  if (!isRecord(value) || !hasValidBookBase(value)) {
    return undefined;
  }

  const base: BookRecordBase = {
    schemaVersion: BOOK_SCHEMA_VERSION,
    id: value.id,
    uri: value.uri,
    source: value.source,
    title: value.title,
    authors: [...value.authors],
    capabilities: createBookCapabilities(value.format),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
  if (isNonNegativeFiniteNumber(value.lastOpenedAt)) {
    base.lastOpenedAt = value.lastOpenedAt;
  } else if (value.lastOpenedAt !== undefined) {
    return undefined;
  }

  if (value.format === 'txt') {
    if (!isRecord(value.formatData) || !isTxtEncoding(value.formatData.encoding)) {
      return undefined;
    }
    return { ...base, format: 'txt', formatData: { encoding: value.formatData.encoding } };
  }

  if (!isRecord(value.formatData)) {
    return undefined;
  }
  const packageIdentifier = value.formatData.packageIdentifier;
  if (packageIdentifier !== undefined && !isNonEmptyString(packageIdentifier)) {
    return undefined;
  }
  return {
    ...base,
    format: 'epub',
    formatData: packageIdentifier === undefined ? {} : { packageIdentifier }
  };
}

function hasValidBookBase(value: Record<string, unknown>): value is Record<string, unknown> & {
  schemaVersion: typeof BOOK_SCHEMA_VERSION;
  id: string;
  uri: string;
  source: BookSource;
  title: string;
  authors: string[];
  format: BookFormat;
  createdAt: number;
  updatedAt: number;
} {
  return (
    value.schemaVersion === BOOK_SCHEMA_VERSION &&
    isNonEmptyString(value.id) &&
    isValidFileUri(value.uri) &&
    isBookSource(value.source) &&
    isNonEmptyString(value.title) &&
    Array.isArray(value.authors) &&
    value.authors.every(isNonEmptyString) &&
    isBookFormat(value.format) &&
    isNonNegativeFiniteNumber(value.createdAt) &&
    isNonNegativeFiniteNumber(value.updatedAt) &&
    value.updatedAt >= value.createdAt
  );
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

function isValidFileUri(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }
  try {
    return new URL(value).protocol === 'file:';
  } catch {
    return false;
  }
}

function isBookSource(value: unknown): value is BookSource {
  return value === 'workspace' || value === 'external';
}

function isBookFormat(value: unknown): value is BookFormat {
  return value === 'txt' || value === 'epub';
}

function isTxtEncoding(value: unknown): value is TxtEncoding {
  return value === 'utf8' || value === 'gbk';
}
import { randomUUID } from 'node:crypto';
