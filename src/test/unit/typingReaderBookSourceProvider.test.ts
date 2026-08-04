import { describe, expect, it, vi } from 'vitest';
import type { BookAdapter, BookHandle } from '../../adapters/bookAdapter';
import type { BookRecord } from '../../domain/books';
import {
  ReaderBookSourceProvider
} from '../../typing/adapters/reader/ReaderBookSourceProvider';

describe('ReaderBookSourceProvider', () => {
  it('inspects Reader books through the existing safe Book Adapter projection', async () => {
    const { provider, handle, adapter } = createProvider();

    await expect(provider.inspect({
      kind: 'readerBook',
      bookId: 'book-1',
      suggestedSectionId: 'chapter-2'
    })).resolves.toMatchObject({
      title: '书架中的书',
      contentProfile: { kind: 'mixed', category: 'adHoc' },
      ranges: [
        { kind: 'whole' },
        { kind: 'chapter', chapterId: 'chapter-1' },
        { kind: 'chapter', chapterId: 'chapter-2' }
      ],
      counts: {
        graphemes: 38,
        hanGraphemes: 6,
        englishWords: 4,
        printableUnits: 32
      }
    });

    expect(adapter.open).toHaveBeenCalledWith(book());
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it('prepares only the selected Reader chapter and preserves the public chapter range', async () => {
    const { provider, handle } = createProvider();

    await expect(provider.prepare(
      { kind: 'readerBook', bookId: 'book-1' },
      { kind: 'chapter', chapterId: 'chapter-2' }
    )).resolves.toMatchObject({
      normalizedText: '第二章 Typing practice',
      contentProfile: { kind: 'mixed', category: 'adHoc' },
      selectedRange: { kind: 'chapter', chapterId: 'chapter-2' }
    });

    expect(handle.getSection).toHaveBeenCalledTimes(1);
    expect(handle.getSection).toHaveBeenCalledWith('chapter-2');
    expect(handle.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports a missing Reader source without attempting to open an adapter', async () => {
    const adapter = { format: 'epub', open: vi.fn() } as unknown as BookAdapter;
    const provider = new ReaderBookSourceProvider(
      { get: () => undefined },
      { get: () => adapter }
    );

    await expect(provider.inspect({
      kind: 'readerBook',
      bookId: 'missing'
    })).rejects.toThrow('Reader book is unavailable: missing');
    expect(adapter.open).not.toHaveBeenCalled();
  });
});

function createProvider() {
  const dispose = vi.fn();
  const handle = {
    getSections: vi.fn(async () => [
      { id: 'chapter-1', title: '第一章', order: 0, progressionWeight: 1 },
      { id: 'chapter-2', title: '第二章', order: 1, progressionWeight: 1 }
    ]),
    getSection: vi.fn(async (sectionId: string) => safeSection(
      sectionId,
      sectionId === 'chapter-1'
        ? '第一章 Reader bridge'
        : '第二章 Typing practice查看图片：Cover',
      sectionId === 'chapter-2' ? '查看图片：Cover' : undefined
    )),
    dispose
  } as unknown as BookHandle & {
    getSections: ReturnType<typeof vi.fn>;
    getSection: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  const adapter = {
    format: 'epub',
    open: vi.fn(async () => handle)
  } as unknown as BookAdapter & {
    open: ReturnType<typeof vi.fn>;
  };
  return {
    handle,
    adapter,
    provider: new ReaderBookSourceProvider(
      { get: (bookId: string) => bookId === 'book-1' ? book() : undefined },
      { get: () => adapter }
    )
  };
}

function book(): BookRecord {
  return {
    schemaVersion: 2,
    id: 'book-1',
    uri: 'file:///book.epub',
    source: 'external',
    title: '书架中的书',
    authors: ['作者'],
    capabilities: { readable: true, typing: false, toc: true },
    format: 'epub',
    formatData: {},
    createdAt: 1,
    updatedAt: 1
  };
}

function safeSection(sectionId: string, text: string, resourceLabel?: string) {
  const resourceStart = resourceLabel ? text.indexOf(resourceLabel) : -1;
  return {
    sectionId,
    title: sectionId,
    sanitizedHtml: '<p>ignored</p>',
    localResources: [],
    sourceRevision: `${sectionId}-revision`,
    immersiveProjection: {
      text,
      projectionRevision: 'fixture-v1',
      resourceAnchors: resourceStart >= 0 && resourceLabel ? [{
        resourceId: 'image-id', label: resourceLabel,
        startOffset: resourceStart, endOffset: resourceStart + resourceLabel.length
      }] : [],
      segments: []
    },
    locatorSpace: {
      kind: 'epub',
      sourceRevision: `${sectionId}-revision`,
      projectionRevision: 'fixture-v1'
    }
  };
}
