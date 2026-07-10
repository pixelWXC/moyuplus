import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import iconv from 'iconv-lite';
import { afterEach, describe, expect, it } from 'vitest';
import { TxtLibraryStore } from '../../storage/txtLibraryStore';
import {
  TxtFileMissingError,
  TxtFileService,
  decodeTxtBuffer,
  determineTxtFileSource,
  splitPhysicalLines
} from '../../txt/txtFileService';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-txt-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('TXT file decoding and line splitting', () => {
  it('decodes UTF-8 and GBK buffers', () => {
    const text = '第一章\nHello';

    expect(decodeTxtBuffer(Buffer.from(text, 'utf8'), 'utf8')).toBe(text);
    expect(decodeTxtBuffer(iconv.encode(text, 'gbk'), 'gbk')).toBe(text);
  });

  it('rejects invalid UTF-8 bytes instead of silently replacing characters', () => {
    expect(() => decodeTxtBuffer(Buffer.from([0xff, 0xfe, 0xfd]), 'utf8')).toThrow('UTF-8');
  });

  it('splits CRLF, LF, and CR text into physical lines without line endings', () => {
    expect(splitPhysicalLines('a\r\nb\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('TxtFileService', () => {
  it('classifies imported files inside workspace folders as workspace files', async () => {
    const workspaceDir = await createTempDir();
    const externalDir = await createTempDir();
    const workspaceFile = path.join(workspaceDir, 'book.txt');
    const externalFile = path.join(externalDir, 'book.txt');

    expect(determineTxtFileSource(pathToFileURL(workspaceFile).toString(), [pathToFileURL(workspaceDir).toString()])).toBe(
      'workspace'
    );
    expect(determineTxtFileSource(pathToFileURL(externalFile).toString(), [pathToFileURL(workspaceDir).toString()])).toBe(
      'external'
    );
  });

  it('imports a TXT file into the global library and reads the full text', async () => {
    const workspaceDir = await createTempDir();
    const filePath = path.join(workspaceDir, 'book.txt');
    await writeFile(filePath, 'hello\nworld', 'utf8');

    const store = new TxtLibraryStore(new MemoryMemento());
    const service = new TxtFileService(store, { now: () => 1_788_900_000_000 });
    const imported = await service.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: [pathToFileURL(workspaceDir).toString()]
    });

    expect(imported).toMatchObject({
      name: 'book.txt',
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      source: 'workspace',
      createdAt: 1_788_900_000_000,
      updatedAt: 1_788_900_000_000
    });
    expect(store.list()).toEqual([imported]);
    await expect(service.readFullText(imported.id)).resolves.toBe('hello\nworld');
  });

  it('reads GBK files and exposes practice physical lines', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'gbk.txt');
    await writeFile(filePath, iconv.encode('第一行\r\n第二行', 'gbk'));
    const service = new TxtFileService(new TxtLibraryStore(new MemoryMemento()));
    const imported = await service.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'gbk',
      workspaceFolderUris: []
    });

    await expect(service.readFullText(imported.id)).resolves.toBe('第一行\r\n第二行');
    await expect(service.readPracticePhysicalLines(imported.id)).resolves.toEqual(['第一行', '第二行']);
  });

  it('reports missing imported files without removing the library record silently', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'missing.txt');
    await writeFile(filePath, 'temporary', 'utf8');
    const store = new TxtLibraryStore(new MemoryMemento());
    const service = new TxtFileService(store);
    const imported = await service.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });
    await rm(filePath);

    await expect(service.readFullText(imported.id)).rejects.toBeInstanceOf(TxtFileMissingError);
    await expect(service.findInvalidImportedFiles()).resolves.toEqual([imported]);
    expect(store.getById(imported.id)).toEqual(imported);
  });

  it('removes imported TXT records through the service', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'remove-me.txt');
    await writeFile(filePath, 'remove me', 'utf8');
    const store = new TxtLibraryStore(new MemoryMemento());
    const service = new TxtFileService(store);
    const imported = await service.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });

    await service.removeImportedFile(imported.id);

    expect(store.list()).toEqual([]);
  });

  it('updates an imported TXT encoding without replacing its identity', async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, 'switch-encoding.txt');
    await writeFile(filePath, iconv.encode('中文', 'gbk'));
    const store = new TxtLibraryStore(new MemoryMemento());
    const service = new TxtFileService(store, { now: () => 200 });
    const imported = await service.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });

    const updated = await service.updateImportedFileEncoding(imported.id, 'gbk');

    expect(updated).toMatchObject({
      id: imported.id,
      uri: imported.uri,
      createdAt: imported.createdAt,
      encoding: 'gbk',
      updatedAt: 200
    });
    await expect(service.readFullText(imported.id)).resolves.toBe('中文');
  });
});
