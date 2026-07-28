import { randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  readFile,
  readdir,
  rm,
  unlink
} from 'node:fs/promises';
import path from 'node:path';
import type { PracticeResult } from '../../domain/analytics';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';

const SAFE_RESULT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface ResultStoreOptions {
  atomicWriter?: AtomicFileWriterPort;
}

export class ResultStore {
  private readonly resultsDirectory: string;
  private readonly writer: AtomicFileWriterPort;

  constructor(
    typingStorageDirectory: string,
    options: ResultStoreOptions = {}
  ) {
    this.resultsDirectory = path.join(path.resolve(typingStorageDirectory), 'results');
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
  }

  async commit(result: PracticeResult): Promise<void> {
    validateResult(result);
    const file = this.resultFile(result);
    const claim = path.join(this.resultsDirectory, '.ids', `${result.id}.json`);
    const serialized = `${JSON.stringify(result, undefined, 2)}\n`;
    const claimed = await readOptional(claim);
    if (claimed !== undefined) {
      assertSameResult(result.id, claimed, serialized);
      await ensureLinkedResult(claim, file, result.id, serialized);
      return;
    }

    const staging = path.join(
      this.resultsDirectory,
      '.staging',
      `.${result.id}.${randomUUID()}.ready`
    );
    await this.writer.write(staging, serialized);
    try {
      await mkdir(path.dirname(claim), { recursive: true });
      await link(staging, claim);
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
      const concurrent = await readFile(claim, 'utf8');
      assertSameResult(result.id, concurrent, serialized);
    }
    try {
      await ensureLinkedResult(claim, file, result.id, serialized);
    } finally {
      await unlink(staging).catch(() => undefined);
    }
  }

  async get(resultId: string): Promise<PracticeResult | undefined> {
    validateResultId(resultId);
    const results = await this.list();
    return structuredClone(results.find(result => result.id === resultId));
  }

  async list(): Promise<PracticeResult[]> {
    const results: PracticeResult[] = [];
    let months: string[];
    try {
      months = await readdir(this.resultsDirectory);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    for (const month of months.sort()) {
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const directory = path.join(this.resultsDirectory, month);
      const files = await readdir(directory);
      for (const file of files.sort()) {
        if (!file.endsWith('.json')) continue;
        const value = JSON.parse(await readFile(path.join(directory, file), 'utf8')) as PracticeResult;
        validateResult(value);
        results.push(value);
      }
    }
    return results
      .sort((left, right) => left.endedAt - right.endedAt || left.id.localeCompare(right.id))
      .map(result => structuredClone(result));
  }

  async clearAll(): Promise<void> {
    await rm(this.resultsDirectory, { recursive: true, force: true });
  }

  private resultFile(result: PracticeResult): string {
    const ended = new Date(result.endedAt);
    if (!Number.isFinite(ended.getTime())) {
      throw new Error('Result endedAt must be a valid timestamp.');
    }
    const month = `${ended.getUTCFullYear()}-${String(ended.getUTCMonth() + 1).padStart(2, '0')}`;
    return path.join(this.resultsDirectory, month, `${result.id}.json`);
  }
}

async function ensureLinkedResult(
  claim: string,
  file: string,
  resultId: string,
  serialized: string
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await link(claim, file);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const existing = await readFile(file, 'utf8');
    assertSameResult(resultId, existing, serialized);
  }
}

function validateResult(result: PracticeResult): void {
  validateResultId(result.id);
  if (result.schemaVersion !== 1) {
    throw new Error('Unsupported practice result schema version.');
  }
  if (!Number.isFinite(result.endedAt)) {
    throw new Error('Result endedAt must be a valid timestamp.');
  }
}

function validateResultId(resultId: string): void {
  if (!SAFE_RESULT_ID.test(resultId)) {
    throw new Error(`Invalid result id: ${resultId}`);
  }
}

function assertSameResult(resultId: string, existing: string, serialized: string): void {
  if (canonical(existing) !== canonical(serialized)) {
    throw new Error(`Result id already exists with different content: ${resultId}`);
  }
}

function canonical(value: string): string {
  return JSON.stringify(JSON.parse(value));
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}
