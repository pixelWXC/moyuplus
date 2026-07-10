import { describe, expect, it } from 'vitest';
import {
  BOOK_SCHEMA_VERSION,
  createBookCapabilities,
  createBookId,
  normalizeBookRecord,
  type BookRecord
} from '../../domain/books';

const now = 1_788_888_888_000;

function txtBook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: BOOK_SCHEMA_VERSION,
    id: 'book-1',
    uri: 'file:///books/book.txt',
    source: 'workspace',
    title: 'Book',
    authors: ['Author'],
    capabilities: createBookCapabilities('txt'),
    createdAt: now,
    updatedAt: now,
    format: 'txt',
    formatData: { encoding: 'utf8' },
    ...overrides
  };
}

describe('BookRecord', () => {
  it('normalizes TXT and EPUB records with canonical capabilities', () => {
    expect(normalizeBookRecord(txtBook({ capabilities: { readable: false } }))).toEqual({
      ...txtBook(),
      capabilities: { readable: true, typing: true, toc: true }
    });

    const epub = normalizeBookRecord({
      ...txtBook(),
      uri: 'file:///books/book.epub',
      source: 'external',
      format: 'epub',
      formatData: { packageIdentifier: 'urn:isbn:123' }
    });
    expect(epub).toMatchObject({
      format: 'epub',
      source: 'external',
      capabilities: { readable: true, typing: false, toc: true },
      formatData: { packageIdentifier: 'urn:isbn:123' }
    });
  });

  it.each([
    ['empty id', { id: '' }],
    ['invalid source', { source: 'remote' }],
    ['invalid encoding', { formatData: { encoding: 'latin1' } }],
    ['invalid createdAt', { createdAt: -1 }],
    ['updated before creation', { updatedAt: now - 1 }]
  ])('rejects %s', (_name, override) => {
    expect(normalizeBookRecord(txtBook(override))).toBeUndefined();
  });

  it('creates URI-independent random stable identifiers', () => {
    const first = createBookId();
    const second = createBookId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });

  it('preserves the discriminated union shape', () => {
    const record = normalizeBookRecord(txtBook()) as BookRecord;

    expect(record.format).toBe('txt');
    if (record.format === 'txt') {
      expect(record.formatData.encoding).toBe('utf8');
    }
  });
});
