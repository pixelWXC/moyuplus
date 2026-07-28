import { readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { PracticeResult } from '../../domain/analytics';
import type { PracticeResultCommitPort } from '../../application/ports';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';

const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface PendingResultStoreOptions {
  atomicWriter?: AtomicFileWriterPort;
}

export type PendingResultRetryOutcome = 'missing' | 'committed';

export interface PendingResultRetrySummary {
  committedSessionIds: string[];
  failedSessionIds: string[];
}

export class PendingResultStore {
  private readonly sessionsDirectory: string;
  private readonly writer: AtomicFileWriterPort;

  constructor(
    workspaceStorageDirectory: string,
    options: PendingResultStoreOptions = {}
  ) {
    this.sessionsDirectory = path.join(
      path.resolve(workspaceStorageDirectory),
      'typing',
      'sessions'
    );
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
  }

  async save(sessionId: string, result: PracticeResult): Promise<void> {
    validateSessionId(sessionId);
    validateResult(result);
    if (result.sessionId !== sessionId) {
      throw new Error('Pending result session id does not match its storage path.');
    }
    await this.writer.write(this.pendingFile(sessionId), serialize(result));
  }

  async get(sessionId: string): Promise<PracticeResult | undefined> {
    validateSessionId(sessionId);
    const serialized = await readOptional(this.pendingFile(sessionId));
    if (serialized === undefined) return undefined;
    const result = JSON.parse(serialized) as PracticeResult;
    validateResult(result);
    if (result.sessionId !== sessionId) {
      throw new Error('Pending result session id does not match its storage path.');
    }
    return structuredClone(result);
  }

  async retry(
    sessionId: string,
    results: PracticeResultCommitPort
  ): Promise<PendingResultRetryOutcome> {
    validateSessionId(sessionId);
    const file = this.pendingFile(sessionId);
    const serialized = await readOptional(file);
    if (serialized === undefined) return 'missing';
    const result = JSON.parse(serialized) as PracticeResult;
    validateResult(result);
    if (result.sessionId !== sessionId) {
      throw new Error('Pending result session id does not match its storage path.');
    }

    await results.commit(structuredClone(result));

    const current = await readOptional(file);
    if (current !== undefined && canonical(current) === canonical(serialized)) {
      await unlink(file).catch(error => {
        if (!isNotFound(error)) throw error;
      });
    }
    return 'committed';
  }

  async retryAll(
    results: PracticeResultCommitPort
  ): Promise<PendingResultRetrySummary> {
    let entries;
    try {
      entries = await readdir(this.sessionsDirectory, { withFileTypes: true });
    } catch (error) {
      if (isNotFound(error)) {
        return { committedSessionIds: [], failedSessionIds: [] };
      }
      throw error;
    }
    const committedSessionIds: string[] = [];
    const failedSessionIds: string[] = [];
    for (const entry of entries
      .filter(value => value.isDirectory() && SAFE_SESSION_ID.test(value.name))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      if (await this.get(entry.name) === undefined) continue;
      try {
        const outcome = await this.retry(entry.name, results);
        if (outcome === 'committed') committedSessionIds.push(entry.name);
      } catch {
        failedSessionIds.push(entry.name);
      }
    }
    return { committedSessionIds, failedSessionIds };
  }

  private pendingFile(sessionId: string): string {
    return path.join(this.sessionsDirectory, sessionId, 'pending-result.v1.json');
  }
}

function validateSessionId(sessionId: string): void {
  if (!SAFE_SESSION_ID.test(sessionId)) {
    throw new Error(`Invalid practice session id: ${sessionId}`);
  }
}

function validateResult(result: PracticeResult): void {
  if (result.schemaVersion !== 1) {
    throw new Error('Unsupported practice result schema version.');
  }
  if (result.id.trim().length === 0) {
    throw new Error('Practice result requires an id.');
  }
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
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
