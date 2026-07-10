import { describe, expect, it } from 'vitest';
import { TypingSourceCatalog } from '../../typing/typingSourceCatalog';
import type { BookRecord } from '../../domain/books';
describe('TypingSourceCatalog', () => {
  it('only exposes TXT books with typing capability', () => {
    const base = { schemaVersion: 2 as const, source: 'external' as const, authors: [], createdAt: 1, updatedAt: 1 };
    const txt = { ...base, id: 't', uri: 'file:///t.txt', title: 't', format: 'txt' as const, formatData: { encoding: 'utf8' as const }, capabilities: { readable: true as const, typing: true, toc: true } };
    const epub = { ...base, id: 'e', uri: 'file:///e.epub', title: 'e', format: 'epub' as const, formatData: {}, capabilities: { readable: true as const, typing: false, toc: true } };
    expect(new TypingSourceCatalog().filter([txt, epub] as BookRecord[])).toEqual([txt]);
  });
});
