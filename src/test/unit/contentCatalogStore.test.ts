import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PracticeMaterialRecord } from '../../typing';
import {
  AtomicFileWriter,
  ContentCatalogStore,
  type AtomicFileWriterPort
} from '../../typing/adapters/storage';

const temporaryRoots: string[] = [];

describe('ContentCatalogStore', () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(async root => {
      const { rm } = await import('node:fs/promises');
      await rm(root, { recursive: true, force: true });
    }));
  });

  it('stores catalog metadata and immutable managed bodies in deterministic paths', async () => {
    const root = await temporaryRoot();
    const store = new ContentCatalogStore(root, { ownerId: 'window-a' });
    const record = material('material-a', 'revision-1');

    await store.upsert(record, '规范化正文');

    await expect(store.get(record.id)).resolves.toEqual(record);
    await expect(store.readBody(record.id, record.revision)).resolves.toBe('规范化正文');
    const catalog = JSON.parse(await readFile(
      path.join(root, 'materials', 'catalog.v1.json'),
      'utf8'
    ));
    expect(catalog).toMatchObject({
      schemaVersion: 1,
      revision: 1,
      materials: [{ record }]
    });
  });

  it('serializes concurrent writers so neither catalog update is lost', async () => {
    const root = await temporaryRoot();
    const storeA = new ContentCatalogStore(root, {
      ownerId: 'window-a',
      retryDelayMs: 1
    });
    const storeB = new ContentCatalogStore(root, {
      ownerId: 'window-b',
      retryDelayMs: 1
    });

    await Promise.all([
      storeA.upsert(material('material-a', 'r1'), '正文 A'),
      storeB.upsert(material('material-b', 'r1'), '正文 B')
    ]);

    expect((await storeA.list()).map(record => record.id).sort()).toEqual(['material-a', 'material-b']);
    await expect(storeA.readBody('material-a', 'r1')).resolves.toBe('正文 A');
    await expect(storeA.readBody('material-b', 'r1')).resolves.toBe('正文 B');
  });

  it('recovers a stale lock without deleting its diagnostic record', async () => {
    const root = await temporaryRoot();
    const materials = path.join(root, 'materials');
    await mkdir(materials, { recursive: true });
    await writeFile(path.join(materials, 'catalog.lock'), JSON.stringify({
      schemaVersion: 1,
      ownerId: 'dead-window',
      acquiredAt: 100
    }), 'utf8');
    const store = new ContentCatalogStore(root, {
      ownerId: 'window-b',
      now: () => 10_000,
      lockTimeoutMs: 500,
      retryDelayMs: 1
    });

    await store.upsert(material('material-a', 'r1'), '正文');

    const recovered = await readdir(path.join(materials, 'recovered-locks'));
    expect(recovered).toHaveLength(1);
    expect(await readFile(path.join(materials, 'recovered-locks', recovered[0]), 'utf8'))
      .toContain('dead-window');
  });

  it('does not advance catalog metadata when the atomic catalog write fails', async () => {
    const root = await temporaryRoot();
    const initial = new ContentCatalogStore(root, { ownerId: 'window-a' });
    await initial.upsert(material('material-a', 'r1'), '第一版');
    const delegate = new AtomicFileWriter();
    const failingWriter: AtomicFileWriterPort = {
      async write(file, data) {
        if (file.endsWith('catalog.v1.json')) {
          throw new Error('simulated disk failure');
        }
        await delegate.write(file, data);
      }
    };
    const failing = new ContentCatalogStore(root, {
      ownerId: 'window-b',
      atomicWriter: failingWriter
    });

    await expect(failing.upsert(material('material-a', 'r2'), '第二版'))
      .rejects.toThrow('simulated disk failure');

    const reopened = new ContentCatalogStore(root, { ownerId: 'window-c' });
    expect((await reopened.get('material-a'))?.revision).toBe('r1');
    await expect(reopened.readBody('material-a', 'r1')).resolves.toBe('第一版');
  });

  it('soft deletes and restores metadata while retaining the managed body', async () => {
    const root = await temporaryRoot();
    const store = new ContentCatalogStore(root, {
      ownerId: 'window-a',
      now: () => 5_000
    });
    const record = material('material-a', 'r1');
    await store.upsert(record, '正文');

    await store.softDelete(record.id);
    expect(await store.get(record.id)).toBeUndefined();
    expect((await store.list({ includeDeleted: true })).map(value => value.id)).toEqual([record.id]);
    await expect(store.readBody(record.id, record.revision)).resolves.toBe('正文');

    await store.restore(record.id);
    expect(await store.get(record.id)).toEqual(record);
  });

  it('permanently purges expired deleted materials unless an active practice protects them', async () => {
    const root = await temporaryRoot();
    const store = new ContentCatalogStore(root, {
      ownerId: 'window-a',
      now: () => 5_000
    });
    const record = material('material-a', 'r1');
    await store.upsert(record, '正文');
    await store.softDelete(record.id);

    await expect(store.purgeDeletedBefore(
      5_000,
      new Set([record.id])
    )).resolves.toEqual([]);
    await expect(store.readBody(record.id, record.revision)).resolves.toBe('正文');

    await expect(store.purgeDeletedBefore(5_000)).resolves.toEqual([record]);
    await expect(store.listDeleted()).resolves.toEqual([]);
    await expect(store.readBody(record.id, record.revision)).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('cleans orphaned managed-body directories without touching catalogued materials', async () => {
    const root = await temporaryRoot();
    const store = new ContentCatalogStore(root, { ownerId: 'window-a' });
    await store.upsert(material('retained', 'r1'), '保留');
    const orphan = path.join(root, 'materials', 'bodies', 'orphaned');
    await mkdir(orphan, { recursive: true });
    await writeFile(path.join(orphan, 'r1.txt'), '孤立正文', 'utf8');
    const staleRevision = path.join(
      root,
      'materials',
      'bodies',
      'retained',
      'old-revision.txt'
    );
    await writeFile(staleRevision, '旧版本', 'utf8');

    await expect(store.cleanupOrphanedBodies()).resolves.toEqual(['orphaned']);
    await expect(store.readBody('retained', 'r1')).resolves.toBe('保留');
    await expect(readFile(path.join(orphan, 'r1.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
    await expect(readFile(staleRevision, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('rejects identifiers that could escape the managed material directory', async () => {
    const root = await temporaryRoot();
    const store = new ContentCatalogStore(root, { ownerId: 'window-a' });

    await expect(store.upsert(material('../escape', 'r1'), '正文'))
      .rejects.toThrow('Invalid material id');
    await expect(store.upsert(material('safe', '../escape'), '正文'))
      .rejects.toThrow('Invalid material revision');
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-catalog-'));
  temporaryRoots.push(root);
  return root;
}

function material(id: string, revision: string): PracticeMaterialRecord {
  return {
    schemaVersion: 1,
    id,
    revision,
    title: id,
    origin: 'custom',
    contentProfile: { kind: 'chinese', category: 'adHoc' },
    tags: [],
    source: { kind: 'managed', bodyRevision: revision },
    counts: { graphemes: 2, hanGraphemes: 2, englishWords: 0, printableUnits: 2 },
    estimatedSeconds: 2,
    createdAt: 1,
    updatedAt: 1
  };
}
