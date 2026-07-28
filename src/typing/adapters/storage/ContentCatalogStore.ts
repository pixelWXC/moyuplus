import {
  readFile
} from 'node:fs/promises';
import path from 'node:path';
import type { PracticeMaterialRecord } from '../../domain/content';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';
import {
  MaterialLock,
  type MaterialLockOptions
} from './MaterialLock';

interface StoredMaterial {
  record: PracticeMaterialRecord;
  deletedAt?: number;
}

interface ContentCatalogFile {
  schemaVersion: 1;
  revision: number;
  materials: StoredMaterial[];
}

export interface ContentCatalogStoreOptions extends MaterialLockOptions {
  atomicWriter?: AtomicFileWriterPort;
}

export interface ListMaterialOptions {
  includeDeleted?: boolean;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class ContentCatalogStore {
  private readonly materialsDirectory: string;
  private readonly catalogFile: string;
  private readonly bodiesDirectory: string;
  private readonly lock: MaterialLock;
  private readonly writer: AtomicFileWriterPort;
  private readonly now: () => number;

  constructor(
    typingStorageDirectory: string,
    options: ContentCatalogStoreOptions
  ) {
    this.materialsDirectory = path.join(path.resolve(typingStorageDirectory), 'materials');
    this.catalogFile = path.join(this.materialsDirectory, 'catalog.v1.json');
    this.bodiesDirectory = path.join(this.materialsDirectory, 'bodies');
    this.lock = new MaterialLock(this.materialsDirectory, options);
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
    this.now = options.now ?? Date.now;
  }

  async list(options: ListMaterialOptions = {}): Promise<PracticeMaterialRecord[]> {
    const catalog = await this.loadCatalog();
    return catalog.materials
      .filter(entry => options.includeDeleted || entry.deletedAt === undefined)
      .map(entry => structuredClone(entry.record));
  }

  async get(materialId: string): Promise<PracticeMaterialRecord | undefined> {
    validateSegment(materialId, 'material id');
    const catalog = await this.loadCatalog();
    const stored = catalog.materials.find(entry => (
      entry.record.id === materialId && entry.deletedAt === undefined
    ));
    return stored ? structuredClone(stored.record) : undefined;
  }

  async upsert(record: PracticeMaterialRecord, normalizedBody?: string): Promise<void> {
    validateRecord(record);
    await this.lock.runExclusive(async () => {
      const catalog = await this.loadCatalog();
      if (normalizedBody !== undefined) {
        await this.writeImmutableBody(record.id, record.revision, normalizedBody);
      }
      const index = catalog.materials.findIndex(entry => entry.record.id === record.id);
      const next: StoredMaterial = { record: structuredClone(record) };
      if (index >= 0) {
        catalog.materials[index] = next;
      } else {
        catalog.materials.push(next);
      }
      catalog.revision += 1;
      await this.saveCatalog(catalog);
    });
  }

  async readBody(materialId: string, revision: string): Promise<string> {
    validateSegment(materialId, 'material id');
    validateSegment(revision, 'material revision');
    return readFile(this.bodyFile(materialId, revision), 'utf8');
  }

  async softDelete(materialId: string): Promise<void> {
    validateSegment(materialId, 'material id');
    await this.lock.runExclusive(async () => {
      const catalog = await this.loadCatalog();
      const stored = catalog.materials.find(entry => entry.record.id === materialId);
      if (!stored) {
        throw new Error(`Material not found: ${materialId}`);
      }
      stored.deletedAt = this.now();
      catalog.revision += 1;
      await this.saveCatalog(catalog);
    });
  }

  async restore(materialId: string): Promise<void> {
    validateSegment(materialId, 'material id');
    await this.lock.runExclusive(async () => {
      const catalog = await this.loadCatalog();
      const stored = catalog.materials.find(entry => entry.record.id === materialId);
      if (!stored) {
        throw new Error(`Material not found: ${materialId}`);
      }
      delete stored.deletedAt;
      catalog.revision += 1;
      await this.saveCatalog(catalog);
    });
  }

  private async loadCatalog(): Promise<ContentCatalogFile> {
    let raw: string;
    try {
      raw = await readFile(this.catalogFile, 'utf8');
    } catch (error) {
      if (isNotFound(error)) {
        return { schemaVersion: 1, revision: 0, materials: [] };
      }
      throw error;
    }
    const value = JSON.parse(raw) as Partial<ContentCatalogFile>;
    if (
      value.schemaVersion !== 1
      || !Number.isInteger(value.revision)
      || !Array.isArray(value.materials)
    ) {
      throw new Error('Material catalog is invalid or uses an unsupported schema.');
    }
    return structuredClone(value as ContentCatalogFile);
  }

  private async saveCatalog(catalog: ContentCatalogFile): Promise<void> {
    await this.writer.write(this.catalogFile, `${JSON.stringify(catalog, undefined, 2)}\n`);
  }

  private async writeImmutableBody(
    materialId: string,
    revision: string,
    normalizedBody: string
  ): Promise<void> {
    const file = this.bodyFile(materialId, revision);
    try {
      const existing = await readFile(file, 'utf8');
      if (existing !== normalizedBody) {
        throw new Error(
          `Managed material body already exists with different content: ${materialId}@${revision}`
        );
      }
      return;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await this.writer.write(file, normalizedBody);
  }

  private bodyFile(materialId: string, revision: string): string {
    return path.join(this.bodiesDirectory, materialId, `${revision}.txt`);
  }
}

function validateRecord(record: PracticeMaterialRecord): void {
  validateSegment(record.id, 'material id');
  validateSegment(record.revision, 'material revision');
  if (record.schemaVersion !== 1) {
    throw new Error('Unsupported material schema version.');
  }
  if (record.source.kind === 'managed' && record.source.bodyRevision !== record.revision) {
    throw new Error('Managed material body revision must match the catalog revision.');
  }
}

function validateSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    const display = label === 'material id' ? 'material id' : 'material revision';
    throw new Error(`Invalid ${display}: ${value}`);
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
