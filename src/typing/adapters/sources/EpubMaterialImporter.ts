import { createHash } from 'node:crypto';
import type { BookAdapter } from '../../../adapters/bookAdapter';
import { EpubAdapter } from '../../../adapters/epub/epubAdapter';
import {
  BOOK_SCHEMA_VERSION,
  type BookRecord
} from '../../../domain/books';
import {
  TYPING_SCHEMA_VERSION,
  inferAdHocContentProfile,
  normalizeMaterialText,
  preparePracticeContent,
  type ContentProfile,
  type MaterialChapterIndex,
  type PracticeMaterialRecord
} from '../../domain/content';
import type { ContentCatalogStore } from '../storage';

export interface EpubMaterialImportRequest {
  sourceUri: string;
  chapterIds?: string[];
  contentProfile?: ContentProfile;
  tags?: string[];
}

export interface EpubMaterialChapterSummary {
  id: string;
  title: string;
}

export interface EpubMaterialImporterOptions {
  adapter?: BookAdapter;
  createId: () => string;
  now?: () => number;
}

export class EpubMaterialImporter {
  private readonly adapter: BookAdapter;
  private readonly now: () => number;

  constructor(
    private readonly catalog: ContentCatalogStore,
    private readonly options: EpubMaterialImporterOptions
  ) {
    this.adapter = options.adapter ?? new EpubAdapter();
    this.now = options.now ?? Date.now;
  }

  async listChapters(sourceUri: string): Promise<EpubMaterialChapterSummary[]> {
    const metadata = await this.adapter.inspect(sourceUri);
    const now = this.now();
    const handle = await this.adapter.open({
      schemaVersion: BOOK_SCHEMA_VERSION,
      id: `typing-import-preview-${this.options.createId()}`,
      uri: sourceUri,
      source: 'external',
      title: metadata.title,
      authors: metadata.authors,
      capabilities: { readable: true, typing: false, toc: true },
      format: 'epub',
      formatData: metadata.packageIdentifier
        ? { packageIdentifier: metadata.packageIdentifier }
        : {},
      createdAt: now,
      updatedAt: now
    });
    try {
      return (await handle.getSections())
        .sort((left, right) => left.order - right.order)
        .map((section, index) => ({
          id: section.id,
          title: section.title?.trim() || `章节 ${index + 1}`
        }));
    } finally {
      handle.dispose();
    }
  }

  async import(request: EpubMaterialImportRequest): Promise<PracticeMaterialRecord> {
    const metadata = await this.adapter.inspect(request.sourceUri);
    const now = this.now();
    const temporaryBook: BookRecord = {
      schemaVersion: BOOK_SCHEMA_VERSION,
      id: `typing-import-${this.options.createId()}`,
      uri: request.sourceUri,
      source: 'external',
      title: metadata.title,
      authors: metadata.authors,
      capabilities: { readable: true, typing: false, toc: true },
      format: 'epub',
      formatData: metadata.packageIdentifier
        ? { packageIdentifier: metadata.packageIdentifier }
        : {},
      createdAt: now,
      updatedAt: now
    };
    const handle = await this.adapter.open(temporaryBook);
    try {
      const availableSections = (await handle.getSections())
        .sort((left, right) => left.order - right.order);
      const requestedChapterIds = request.chapterIds
        ? new Set(request.chapterIds)
        : undefined;
      if (requestedChapterIds?.size === 0) {
        throw new Error('Select at least one EPUB chapter.');
      }
      const sections = requestedChapterIds
        ? availableSections.filter(section => requestedChapterIds.has(section.id))
        : availableSections;
      if (
        requestedChapterIds
        && sections.length !== requestedChapterIds.size
      ) {
        throw new Error('One or more selected EPUB chapters are unavailable.');
      }
      if (sections.length === 0) {
        throw new Error('EPUB contains no readable practice chapters.');
      }
      const chapterTexts: string[] = [];
      const chapterRevisions: string[] = [];
      const chapters: MaterialChapterIndex[] = [];
      let offset = 0;
      for (const section of sections) {
        const safe = await handle.getSection(section.id);
        const text = normalizeMaterialText(safe.immersiveProjection.text);
        if (text.length === 0) continue;
        if (chapterTexts.length > 0) offset += 2;
        const start = offset;
        offset += text.length;
        chapterTexts.push(text);
        chapterRevisions.push(safe.sourceRevision);
        chapters.push({
          id: section.id,
          title: section.title,
          start,
          end: offset
        });
      }
      if (chapterTexts.length === 0) {
        throw new Error('EPUB contains no non-empty practice chapters.');
      }

      const normalizedText = chapterTexts.join('\n\n');
      const revision = createHash('sha256')
        .update('typing-epub-cleanup-v1\0')
        .update(chapterRevisions.join('\0'))
        .update('\0')
        .update(normalizedText)
        .digest('hex');
      const contentProfile = request.contentProfile
        ?? inferAdHocContentProfile(normalizedText);
      const prepared = preparePracticeContent(normalizedText, {
        sourceRevision: revision,
        contentProfile,
        range: { kind: 'whole' }
      });
      const materialId = this.options.createId();
      const record: PracticeMaterialRecord = {
        schemaVersion: TYPING_SCHEMA_VERSION,
        id: materialId,
        revision,
        title: metadata.title,
        origin: 'epubImport',
        contentProfile: structuredClone(contentProfile),
        tags: [...(request.tags ?? [])],
        source: {
          kind: 'epubImport',
          originalUri: request.sourceUri,
          chapterIds: chapters.map(chapter => chapter.id)
        },
        chapters,
        counts: prepared.counts,
        estimatedSeconds: prepared.estimatedSeconds,
        createdAt: now,
        updatedAt: now
      };
      await this.catalog.upsert(record, normalizedText);
      return structuredClone(record);
    } finally {
      handle.dispose();
    }
  }
}
