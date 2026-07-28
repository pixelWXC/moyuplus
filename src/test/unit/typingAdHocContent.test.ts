import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentCatalogStore } from '../../typing/adapters/storage';
import {
  AdHocContentProvider,
  CustomMaterialProvider,
  CustomMaterialWriter
} from '../../typing/adapters/sources';

const temporaryRoots: string[] = [];

describe('typing ad-hoc content', () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, {
      recursive: true,
      force: true
    })));
  });

  it('prepares pasted text without persisting a material by default', async () => {
    const catalog = await createCatalog();
    const provider = new AdHocContentProvider();
    const recipe = { kind: 'adHoc', text: '\uFEFF第一行\r\n\r\n\r\n第二行' } as const;

    expect(provider.canResolve(recipe)).toBe(true);
    await expect(provider.inspect(recipe)).resolves.toMatchObject({
      title: '自由练习',
      contentProfile: { kind: 'chinese', category: 'adHoc' },
      ranges: [{ kind: 'whole' }]
    });
    const prepared = await provider.prepare(recipe, { kind: 'whole' });
    expect(prepared).toMatchObject({
      normalizedText: '第一行\n\n第二行',
      contentProfile: { kind: 'chinese', category: 'adHoc' },
      selectedRange: { kind: 'whole' }
    });
    expect(prepared.materialId).toBeUndefined();
    expect(prepared.sourceRevision).toMatch(/^ad-hoc-[a-f0-9]{16}$/);
    expect(await catalog.list()).toEqual([]);
  });

  it('persists pasted text only through an explicit custom-material save', async () => {
    const catalog = await createCatalog();
    const writer = new CustomMaterialWriter(catalog, {
      createId: () => 'custom-paste-1',
      now: () => 7_000
    });

    const record = await writer.save({
      title: '我的摘录',
      text: '\uFEFF你好\r\n\r\n\r\n世界',
      contentProfile: { kind: 'chinese', category: 'adHoc' },
      tags: ['摘录']
    });

    expect(record).toMatchObject({
      id: 'custom-paste-1',
      title: '我的摘录',
      origin: 'custom',
      contentProfile: { kind: 'chinese', category: 'adHoc' },
      tags: ['摘录'],
      source: { kind: 'managed' },
      createdAt: 7_000,
      updatedAt: 7_000
    });
    expect(record.revision).toMatch(/^body-[a-f0-9]{16}$/);
    await expect(catalog.readBody(record.id, record.revision)).resolves.toBe('你好\n\n世界');
    await expect(new CustomMaterialProvider(catalog).prepare(
      { kind: 'custom', materialId: record.id },
      { kind: 'whole' }
    )).resolves.toMatchObject({
      materialId: record.id,
      normalizedText: '你好\n\n世界'
    });
  });

  it('does not create a catalog record when pasted content is empty after cleanup', async () => {
    const catalog = await createCatalog();
    const writer = new CustomMaterialWriter(catalog, {
      createId: () => 'custom-paste-1',
      now: () => 7_000
    });

    await expect(writer.save({
      title: '空内容',
      text: '\r\n \r\n',
      contentProfile: { kind: 'chinese', category: 'adHoc' }
    })).rejects.toThrow('Practice content is empty');
    expect(await catalog.list()).toEqual([]);
  });
});

async function createCatalog(): Promise<ContentCatalogStore> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-adhoc-'));
  temporaryRoots.push(root);
  return new ContentCatalogStore(root, { ownerId: `test-${temporaryRoots.length}` });
}
