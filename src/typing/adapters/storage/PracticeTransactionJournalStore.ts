import { createHash } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  unlink
} from 'node:fs/promises';
import path from 'node:path';
import type {
  PracticeSessionDelta,
  PracticeTransactionReceipt
} from '../../domain/session';

const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SEGMENT_FILE = /^segment-(\d{6})\.jsonl$/;

export interface PracticeTransactionJournalStoreOptions {
  recordsPerSegment?: number;
}

interface JournalPayload {
  sessionId: string;
  revision: number;
  transactionId: string;
  delta: PracticeSessionDelta;
}

interface JournalEnvelope {
  schemaVersion: 1;
  payload: JournalPayload;
  checksum: string;
}

export class PracticeTransactionJournalStore {
  private readonly sessionsDirectory: string;
  private readonly recordsPerSegment: number;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    workspaceStorageDirectory: string,
    options: PracticeTransactionJournalStoreOptions = {}
  ) {
    this.sessionsDirectory = path.join(
      path.resolve(workspaceStorageDirectory),
      'typing',
      'sessions'
    );
    this.recordsPerSegment = Math.max(
      1,
      Math.trunc(options.recordsPerSegment ?? 256)
    );
  }

  append(
    sessionId: string,
    delta: PracticeSessionDelta
  ): Promise<'appended' | 'duplicate'> {
    validateSessionId(sessionId);
    validateDelta(delta);
    return this.enqueue(sessionId, async () => {
      const records = await this.readAll(sessionId);
      const duplicate = records.find(record =>
        record.transactionId === delta.transactionId
      );
      if (duplicate) {
        if (JSON.stringify(duplicate.delta.receipt) !== JSON.stringify(delta.receipt)) {
          throw new Error('Practice transaction journal id collision.');
        }
        return 'duplicate';
      }
      const latest = records.at(-1);
      if (latest && latest.revision !== delta.baseRevision) {
        throw new Error('Practice transaction journal revision is not continuous.');
      }
      const payload: JournalPayload = {
        sessionId,
        revision: delta.revision,
        transactionId: delta.transactionId,
        delta: structuredClone(delta)
      };
      const envelope: JournalEnvelope = {
        schemaVersion: 1,
        payload,
        checksum: checksum(payload)
      };
      const segmentNumber = Math.floor(
        (delta.revision - 1) / this.recordsPerSegment
      ) + 1;
      const file = this.segmentFile(sessionId, segmentNumber);
      await mkdir(path.dirname(file), { recursive: true });
      const handle = await open(file, 'a');
      try {
        await handle.writeFile(`${JSON.stringify(envelope)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      return 'appended';
    });
  }

  async recover(
    sessionId: string,
    checkpointRevision: number
  ): Promise<PracticeSessionDelta[]> {
    validateSessionId(sessionId);
    validateRevision(checkpointRevision, 'checkpoint');
    const records = await this.readAll(sessionId);
    const pending = records.filter(record => record.revision > checkpointRevision);
    let expectedRevision = checkpointRevision + 1;
    for (const record of pending) {
      if (record.revision !== expectedRevision) {
        throw new Error('Practice transaction journal has a revision gap.');
      }
      expectedRevision += 1;
    }
    return pending.map(record => structuredClone(record.delta));
  }

  async findReceipt(
    sessionId: string,
    transactionId: string
  ): Promise<PracticeTransactionReceipt | undefined> {
    validateSessionId(sessionId);
    if (transactionId.trim().length === 0) {
      throw new Error('Practice transaction id must not be empty.');
    }
    const record = (await this.readAll(sessionId))
      .find(value => value.transactionId === transactionId);
    return record ? structuredClone(record.delta.receipt) : undefined;
  }

  compact(sessionId: string, checkpointRevision: number): Promise<void> {
    validateSessionId(sessionId);
    validateRevision(checkpointRevision, 'checkpoint');
    return this.enqueue(sessionId, async () => {
      const files = await this.segmentFiles(sessionId);
      for (const file of files) {
        const records = await this.readSegment(file.path, file.isLast);
        if (
          records.length > 0
          && records.every(record => record.revision <= checkpointRevision)
        ) {
          await unlink(file.path).catch(error => {
            if (!isNotFound(error)) throw error;
          });
        }
      }
    });
  }

  private async readAll(sessionId: string): Promise<JournalPayload[]> {
    const files = await this.segmentFiles(sessionId);
    const records: JournalPayload[] = [];
    for (const file of files) {
      records.push(...await this.readSegment(file.path, file.isLast));
    }
    records.sort((left, right) => left.revision - right.revision);
    const transactionIds = new Set<string>();
    for (const record of records) {
      if (record.sessionId !== sessionId) {
        throw new Error('Practice transaction journal session id is invalid.');
      }
      if (transactionIds.has(record.transactionId)) {
        throw new Error('Practice transaction journal contains a duplicate transaction.');
      }
      transactionIds.add(record.transactionId);
    }
    return records;
  }

  private async readSegment(file: string, isLast: boolean): Promise<JournalPayload[]> {
    const content = await readFile(file, 'utf8');
    const complete = content.endsWith('\n');
    const lines = content.split('\n');
    if (!complete) {
      if (!isLast) {
        throw new Error('Practice transaction journal has an incomplete non-final segment.');
      }
      lines.pop();
    } else {
      lines.pop();
    }
    return lines.filter(line => line.length > 0).map(line => decodeEnvelope(line));
  }

  private async segmentFiles(
    sessionId: string
  ): Promise<Array<{ path: string; isLast: boolean }>> {
    const directory = this.journalDirectory(sessionId);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const sorted = names
      .filter(name => SEGMENT_FILE.test(name))
      .sort();
    return sorted.map((name, index) => ({
      path: path.join(directory, name),
      isLast: index === sorted.length - 1
    }));
  }

  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve();
    const run = previous.then(task);
    const settled = run.then(() => undefined, () => undefined);
    this.queues.set(sessionId, settled);
    void settled.then(() => {
      if (this.queues.get(sessionId) === settled) {
        this.queues.delete(sessionId);
      }
    });
    return run;
  }

  private journalDirectory(sessionId: string): string {
    return path.join(this.sessionsDirectory, sessionId, 'journal');
  }

  private segmentFile(sessionId: string, segmentNumber: number): string {
    return path.join(
      this.journalDirectory(sessionId),
      `segment-${String(segmentNumber).padStart(6, '0')}.jsonl`
    );
  }
}

function decodeEnvelope(line: string): JournalPayload {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error('Practice transaction journal record is invalid.');
  }
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || !isRecord(value.payload)
    || typeof value.checksum !== 'string'
  ) {
    throw new Error('Practice transaction journal record is invalid.');
  }
  if (checksum(value.payload) !== value.checksum) {
    throw new Error('Practice transaction journal checksum is invalid.');
  }
  const payload = value.payload as unknown as JournalPayload;
  validateSessionId(payload.sessionId);
  validateRevision(payload.revision, 'record');
  if (
    typeof payload.transactionId !== 'string'
    || payload.transactionId.trim().length === 0
    || !isRecord(payload.delta)
  ) {
    throw new Error('Practice transaction journal record is invalid.');
  }
  validateDelta(payload.delta as unknown as PracticeSessionDelta);
  if (
    payload.delta.revision !== payload.revision
    || payload.delta.transactionId !== payload.transactionId
  ) {
    throw new Error('Practice transaction journal record metadata is invalid.');
  }
  return payload;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateSessionId(sessionId: string): void {
  if (!SAFE_SESSION_ID.test(sessionId)) {
    throw new Error(`Invalid practice session id: ${sessionId}`);
  }
}

function validateDelta(delta: PracticeSessionDelta): void {
  if (
    !isRecord(delta)
    || typeof delta.transactionId !== 'string'
    || delta.transactionId.trim().length === 0
  ) {
    throw new Error('Practice transaction delta is invalid.');
  }
  validateRevision(delta.baseRevision, 'base');
  validateRevision(delta.revision, 'delta');
  if (
    delta.revision !== delta.baseRevision + 1
    || !isRecord(delta.receipt)
    || delta.receipt.transactionId !== delta.transactionId
    || delta.receipt.revision !== delta.revision
  ) {
    throw new Error('Practice transaction delta revision is invalid.');
  }
}

function validateRevision(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Practice ${label} revision is invalid.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
