import {
  readFile,
  readdir,
  rm
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

export interface DeletedMaterialRecord {
  record: PracticeMaterialRecord;
  deletedAt: number;
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

  async listDeleted(): Promise<DeletedMaterialRecord[]> {
    const catalog = await this.loadCatalog();
    return catalog.materials
      .filter((entry): entry is StoredMaterial & { deletedAt: number } => (
        entry.deletedAt !== undefined
      ))
      .map(entry => ({
        record: structuredClone(entry.record),
        deletedAt: entry.deletedAt
      }));
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

  async purgeDeletedBefore(
    cutoff: number,
    protectedMaterialIds: ReadonlySet<string> = new Set()
  ): Promise<PracticeMaterialRecord[]> {
    if (!Number.isFinite(cutoff)) {
      throw new Error('Material purge cutoff must be a valid timestamp.');
    }
    return this.lock.runExclusive(async () => {
      const catalog = await this.loadCatalog();
      const removed = catalog.materials.filter(entry => (
        entry.deletedAt !== undefined
        && entry.deletedAt <= cutoff
        && !protectedMaterialIds.has(entry.record.id)
      ));
      if (removed.length === 0) return [];
      const removedIds = new Set(removed.map(entry => entry.record.id));
      catalog.materials = catalog.materials.filter(
        entry => !removedIds.has(entry.record.id)
      );
      catalog.revision += 1;
      await this.saveCatalog(catalog);
      const records = removed.map(entry => structuredClone(entry.record));
      await Promise.all(records.map(record => (
        rm(this.materialDirectory(record.id), { recursive: true, force: true })
      )));
      return records;
    });
  }

  async cleanupOrphanedBodies(): Promise<string[]> {
    return this.lock.runExclusive(async () => {
      const catalog = await this.loadCatalog();
      const retainedRevisions = new Map(
        catalog.materials.map(entry => [
          entry.record.id,
          entry.record.revision
        ])
      );
      let entries;
      try {
        entries = await readdir(this.bodiesDirectory, { withFileTypes: true });
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
      const orphanedIds = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(id => SAFE_SEGMENT.test(id) && !retainedRevisions.has(id));
      await Promise.all(orphanedIds.map(id => (
        rm(this.materialDirectory(id), { recursive: true, force: true })
      )));
      await Promise.all(entries
        .filter(entry => (
          entry.isDirectory()
          && SAFE_SEGMENT.test(entry.name)
          && retainedRevisions.has(entry.name)
        ))
        .map(async entry => {
          const directory = this.materialDirectory(entry.name);
          const expectedFile = `${retainedRevisions.get(entry.name)}.txt`;
          const files = await readdir(directory, { withFileTypes: true });
          await Promise.all(files
            .filter(file => (
              file.isFile()
              && file.name.endsWith('.txt')
              && SAFE_SEGMENT.test(file.name.slice(0, -4))
              && file.name !== expectedFile
            ))
            .map(file => rm(path.join(directory, file.name), { force: true })));
        }));
      return orphanedIds;
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
    return path.join(this.materialDirectory(materialId), `${revision}.txt`);
  }

  private materialDirectory(materialId: string): string {
    validateSegment(materialId, 'material id');
    return path.join(this.bodiesDirectory, materialId);
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
