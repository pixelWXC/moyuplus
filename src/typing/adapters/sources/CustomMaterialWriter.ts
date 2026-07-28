import type {
  ContentProfile,
  PracticeMaterialRecord
} from '../../domain/content';
import {
  normalizeMaterialText,
  preparePracticeContent,
  TYPING_SCHEMA_VERSION
} from '../../domain/content';
import type { ContentCatalogStore } from '../storage';
import { contentRevision } from './AdHocContentProvider';

export interface CustomMaterialWriterOptions {
  createId(): string;
  now(): number;
}

export interface SaveCustomMaterialInput {
  title: string;
  text: string;
  contentProfile: ContentProfile;
  tags?: readonly string[];
}

export class CustomMaterialWriter {
  constructor(
    private readonly catalog: ContentCatalogStore,
    private readonly options: CustomMaterialWriterOptions
  ) {}

  async save(input: SaveCustomMaterialInput): Promise<PracticeMaterialRecord> {
    const title = input.title.trim();
    if (!title) throw new Error('Custom practice material requires a title.');
    const normalized = normalizeMaterialText(input.text);
    const revision = contentRevision(normalized, 'body');
    const prepared = preparePracticeContent(normalized, {
      sourceRevision: revision,
      contentProfile: input.contentProfile,
      range: { kind: 'whole' }
    });
    const now = this.options.now();
    const record: PracticeMaterialRecord = {
      schemaVersion: TYPING_SCHEMA_VERSION,
      id: this.options.createId(),
      revision,
      title,
      origin: 'custom',
      contentProfile: structuredClone(input.contentProfile),
      tags: [...(input.tags ?? [])],
      source: { kind: 'managed', bodyRevision: revision },
      counts: structuredClone(prepared.counts),
      estimatedSeconds: prepared.estimatedSeconds,
      createdAt: now,
      updatedAt: now
    };
    await this.catalog.upsert(record, normalized);
    return structuredClone(record);
  }
}
