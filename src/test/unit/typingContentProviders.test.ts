import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookAdapter, BookHandle } from '../../adapters/bookAdapter';
import type { PracticeMaterialRecord } from '../../typing';
import { ContentCatalogStore } from '../../typing/adapters/storage';
import {
  CustomMaterialProvider,
  EpubMaterialImporter,
  TxtMaterialExporter,
  TxtMaterialImporter
} from '../../typing/adapters/sources';

const temporaryRoots: string[] = [];

describe('typing content providers and imports', () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  it('imports normalized UTF-8 TXT into managed storage and exports plain text only', async () => {
    const catalog = await createCatalog();
    const importer = new TxtMaterialImporter(catalog, {
      createId: () => 'txt-material-1',
      now: () => 1_000
    });
    const exporter = new TxtMaterialExporter(catalog);

    const record = await importer.import({
      bytes: Buffer.from('\uFEFF第一行\r\n\r\n\r\n第二行', 'utf8'),
      encoding: 'utf8',
      title: '练习文本',
      sourceUri: 'file:///source.txt',
      contentProfile: { kind: 'chinese', category: 'modernArticle' }
    });

    expect(record).toMatchObject({
      id: 'txt-material-1',
      title: '练习文本',
      origin: 'txtImport',
      source: { kind: 'txtImport', originalUri: 'file:///source.txt', encoding: 'utf8' },
      counts: { graphemes: 8, hanGraphemes: 6, englishWords: 0, printableUnits: 6 },
      createdAt: 1_000,
      updatedAt: 1_000
    });
    await expect(exporter.export(record.id)).resolves.toBe('第一行\n\n第二行');
  });

  it('infers an ad-hoc content profile when TXT import does not declare one', async () => {
    const catalog = await createCatalog();
    const importer = new TxtMaterialImporter(catalog, {
      createId: () => 'txt-inferred-1',
      now: () => 1_000
    });

    await expect(importer.import({
      bytes: Buffer.from('中文和 English', 'utf8'),
      encoding: 'utf8',
      title: '自动识别'
    })).resolves.toMatchObject({
      contentProfile: { kind: 'mixed', category: 'adHoc' }
    });
  });

  it('resolves stored custom material through the ContentProvider contract', async () => {
    const catalog = await createCatalog();
    const record = material('custom-1', 'r1');
    await catalog.upsert(record, '你好\n世界');
    const provider = new CustomMaterialProvider(catalog);
    const recipe = { kind: 'custom', materialId: record.id } as const;

    expect(provider.canResolve(recipe)).toBe(true);
    await expect(provider.inspect(recipe)).resolves.toMatchObject({
      title: record.title,
      sourceRevision: record.revision,
      contentProfile: record.contentProfile,
      counts: record.counts
    });
    await expect(provider.prepare(recipe, { kind: 'selection', start: 0, end: 2 }))
      .resolves.toMatchObject({
        materialId: record.id,
        sourceRevision: record.revision,
        normalizedText: '你好',
        contentProfile: record.contentProfile
      });
  });

  it('lists only non-empty EPUB practice chapters and keeps hierarchical TOC titles', async () => {
    const catalog = await createCatalog();
    const dispose = vi.fn();
    const adapter = {
      format: 'epub',
      inspect: async () => ({ title: '分离扉页与正文', authors: [] }),
      open: async () => ({
        getToc: async () => [{
          title: '第一章',
          sectionId: 'chapter-title',
          children: [{
            title: '1',
            sectionId: 'chapter-body'
          }]
        }],
        getSections: async () => [
          { id: 'cover', order: 0, progressionWeight: 1 },
          { id: 'chapter-title', order: 1, progressionWeight: 1 },
          { id: 'chapter-body', order: 2, progressionWeight: 1 }
        ],
        getSection: async (id: string) => safeSection(
          id,
          id === 'chapter-body' ? '正文😀' : '　'
        ),
        dispose
      })
    } as unknown as BookAdapter;
    const importer = new EpubMaterialImporter(catalog, {
      adapter,
      createId: () => 'epub-preview-1',
      now: () => 2_000
    });

    await expect(importer.listChapters('file:///split.epub')).resolves.toEqual([
      {
        id: 'chapter-body',
        title: '第一章 · 1',
        graphemes: 3
      }
    ]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('imports only safe EPUB chapter text and records a managed chapter index', async () => {
    const catalog = await createCatalog();
    const dispose = vi.fn();
    const handle = {
      getToc: vi.fn(async () => []),
      getSections: vi.fn(async () => [
        { id: 'chapter-1', title: '一', order: 0, progressionWeight: 3 },
        { id: 'chapter-2', title: '二', order: 1, progressionWeight: 3 }
      ]),
      getSection: vi.fn(async (id: string) => safeSection(
        id,
        id === 'chapter-1' ? '第一章查看图片：Cover' : '第二章',
        id === 'chapter-1' ? '查看图片：Cover' : undefined
      )),
      dispose
    } as unknown as BookHandle;
    const adapter = {
      format: 'epub',
      inspect: vi.fn(async () => ({
        title: '安全书籍',
        authors: ['作者'],
        packageIdentifier: 'fixture'
      })),
      open: vi.fn(async () => handle)
    } as BookAdapter;
    const importer = new EpubMaterialImporter(catalog, {
      adapter,
      createId: () => 'epub-material-1',
      now: () => 2_000
    });

    const record = await importer.import({
      sourceUri: 'file:///book.epub',
      contentProfile: { kind: 'chinese', category: 'fiction' }
    });

    expect(record).toMatchObject({
      id: 'epub-material-1',
      title: '安全书籍',
      origin: 'epubImport',
      chapters: [
        { id: 'chapter-1', title: '一', start: 0, end: 3 },
        { id: 'chapter-2', title: '二', start: 5, end: 8 }
      ],
      source: {
        kind: 'epubImport',
        originalUri: 'file:///book.epub',
        chapterIds: ['chapter-1', 'chapter-2']
      }
    });
    await expect(catalog.readBody(record.id, record.revision)).resolves.toBe('第一章\n\n第二章');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('infers an ad-hoc content profile from extracted EPUB chapter text', async () => {
    const catalog = await createCatalog();
    const adapter = {
      format: 'epub',
      inspect: async () => ({ title: 'English book', authors: [] }),
      open: async () => ({
        getToc: async () => [],
        getSections: async () => [
          { id: 'chapter-1', order: 0, progressionWeight: 1 }
        ],
        getSection: async () => safeSection('chapter-1', 'Typing practice'),
        dispose: () => undefined
      })
    } as unknown as BookAdapter;
    const importer = new EpubMaterialImporter(catalog, {
      adapter,
      createId: () => 'epub-inferred-1',
      now: () => 2_000
    });

    await expect(importer.import({
      sourceUri: 'file:///english.epub'
    })).resolves.toMatchObject({
      contentProfile: { kind: 'english', category: 'adHoc' }
    });
  });

  it('reads and validates only selected EPUB chapters', async () => {
    const catalog = await createCatalog();
    const getSection = vi.fn(async (id: string) => {
      if (id === 'oversized') {
        throw new Error('unselected oversized chapter must not be read');
      }
      return safeSection(id, '可练习内容');
    });
    const adapter = {
      format: 'epub',
      inspect: async () => ({ title: '章节选择', authors: [] }),
      open: async () => ({
        getToc: async () => [],
        getSections: async () => [
          { id: 'selected', title: '选中章', order: 0, progressionWeight: 1 },
          { id: 'oversized', title: '超长章', order: 1, progressionWeight: 1 }
        ],
        getSection,
        dispose: () => undefined
      })
    } as unknown as BookAdapter;
    const importer = new EpubMaterialImporter(catalog, {
      adapter,
      createId: () => 'epub-selected-1',
      now: () => 2_000
    });

    const record = await importer.import({
      sourceUri: 'file:///selected.epub',
      chapterIds: ['selected']
    });

    expect(getSection).toHaveBeenCalledTimes(1);
    expect(getSection).toHaveBeenCalledWith('selected');
    expect(record.source).toMatchObject({
      kind: 'epubImport',
      chapterIds: ['selected']
    });
    expect(record.chapters).toEqual([
      { id: 'selected', title: '选中章', start: 0, end: 5 }
    ]);
  });

  it('disposes the EPUB handle and leaves no catalog entry when a chapter fails', async () => {
    const catalog = await createCatalog();
    const dispose = vi.fn();
    const adapter = {
      format: 'epub',
      inspect: vi.fn(async () => ({ title: '损坏书籍', authors: [] })),
      open: vi.fn(async () => ({
        getToc: async () => [],
        getSections: async () => [
          { id: 'chapter-1', order: 0, progressionWeight: 1 },
          { id: 'chapter-2', order: 1, progressionWeight: 1 }
        ],
        getSection: async (id: string) => {
          if (id === 'chapter-2') throw new Error('unsafe chapter');
          return safeSection(id, '第一章');
        },
        dispose
      }))
    } as unknown as BookAdapter;
    const importer = new EpubMaterialImporter(catalog, {
      adapter,
      createId: () => 'epub-material-1',
      now: () => 2_000
    });

    await expect(importer.import({
      sourceUri: 'file:///broken.epub',
      contentProfile: { kind: 'chinese', category: 'fiction' }
    })).rejects.toThrow('unsafe chapter');

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(await catalog.list()).toEqual([]);
  });
});

async function createCatalog(): Promise<ContentCatalogStore> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-provider-'));
  temporaryRoots.push(root);
  return new ContentCatalogStore(root, { ownerId: `test-${temporaryRoots.length}` });
}

function material(id: string, revision: string): PracticeMaterialRecord {
  return {
    schemaVersion: 1,
    id,
    revision,
    title: '自定义',
    origin: 'custom',
    contentProfile: { kind: 'chinese', category: 'adHoc' },
    tags: [],
    source: { kind: 'managed', bodyRevision: revision },
    counts: { graphemes: 5, hanGraphemes: 4, englishWords: 0, printableUnits: 4 },
    estimatedSeconds: 4,
    createdAt: 1,
    updatedAt: 1
  };
}

function safeSection(id: string, text: string, resourceLabel?: string) {
  const resourceStart = resourceLabel ? text.indexOf(resourceLabel) : -1;
  return {
    sectionId: id,
    sanitizedHtml: '<p>ignored</p>',
    localResources: [],
    sourceRevision: `${id}-revision`,
    immersiveProjection: {
      text,
      projectionRevision: 'fixture-v1',
      resourceAnchors: resourceStart >= 0 && resourceLabel ? [{
        resourceId: 'image-id', label: resourceLabel,
        startOffset: resourceStart, endOffset: resourceStart + resourceLabel.length
      }] : [],
      segments: [{
        kind: 'identity',
        sourceStart: 0,
        sourceEnd: text.length,
        immersiveStart: 0,
        immersiveEnd: text.length,
        safeSourceFloor: 0,
        safeImmersiveFloor: 0
      }]
    },
    locatorSpace: {
      kind: 'epub',
      sourceRevision: `${id}-revision`,
      projectionRevision: 'fixture-v1'
    }
  };
}
