import { createHash } from 'node:crypto';
import type { TxtEncoding } from '../../../domain/books';
import { decodeTxt } from '../../../adapters/txt/txtEncoding';
import {
  TYPING_SCHEMA_VERSION,
  normalizeMaterialText,
  inferAdHocContentProfile,
  preparePracticeContent,
  type ContentProfile,
  type PracticeMaterialRecord
} from '../../domain/content';
import type { ContentCatalogStore } from '../storage';

export interface TxtMaterialImportRequest {
  bytes: Uint8Array;
  encoding: TxtEncoding;
  title: string;
  sourceUri?: string;
  contentProfile?: ContentProfile;
  tags?: string[];
}

export interface TxtMaterialImporterOptions {
  createId: () => string;
  now?: () => number;
}

export class TxtMaterialImporter {
  private readonly now: () => number;

  constructor(
    private readonly catalog: ContentCatalogStore,
    private readonly options: TxtMaterialImporterOptions
  ) {
    this.now = options.now ?? Date.now;
  }

  async import(request: TxtMaterialImportRequest): Promise<PracticeMaterialRecord> {
    const normalizedText = normalizeMaterialText(
      decodeTxt(Buffer.from(request.bytes), request.encoding)
    );
    const revision = createHash('sha256')
      .update('typing-txt-cleanup-v1\0')
      .update(normalizedText)
      .digest('hex');
    const contentProfile = request.contentProfile
      ?? inferAdHocContentProfile(normalizedText);
    const prepared = preparePracticeContent(normalizedText, {
      sourceRevision: revision,
      contentProfile,
      range: { kind: 'whole' }
    });
    const now = this.now();
    const record: PracticeMaterialRecord = {
      schemaVersion: TYPING_SCHEMA_VERSION,
      id: this.options.createId(),
      revision,
      title: requireTitle(request.title),
      origin: 'txtImport',
      contentProfile: structuredClone(contentProfile),
      tags: [...(request.tags ?? [])],
      source: {
        kind: 'txtImport',
        originalUri: request.sourceUri,
        encoding: request.encoding
      },
      counts: prepared.counts,
      estimatedSeconds: prepared.estimatedSeconds,
      createdAt: now,
      updatedAt: now
    };
    await this.catalog.upsert(record, normalizedText);
    return structuredClone(record);
  }
}

function requireTitle(title: string): string {
  const value = title.trim();
  if (value.length === 0) {
    throw new Error('TXT material title is required.');
  }
  return value;
}
