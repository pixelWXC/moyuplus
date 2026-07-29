import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { PracticeSnapshot } from '../../domain/content';
import type { PracticeCheckpoint } from '../../domain/session';
import {
  migratePracticeCheckpoint,
  migratePracticeSnapshot
} from '../../migration/TypingInputArchitectureMigration';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';

const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface WorkspaceSessionStoreOptions {
  atomicWriter?: AtomicFileWriterPort;
  now?: () => number;
}

export interface ActivePracticeSessionReference {
  schemaVersion: 1;
  sessionId: string;
  updatedAt: number;
}

export class WorkspaceSessionStore {
  private readonly sessionsDirectory: string;
  private readonly activeSessionFile: string;
  private readonly writer: AtomicFileWriterPort;
  private readonly now: () => number;

  constructor(
    workspaceStorageDirectory: string,
    options: WorkspaceSessionStoreOptions = {}
  ) {
    const typingDirectory = path.join(
      path.resolve(workspaceStorageDirectory),
      'typing'
    );
    this.sessionsDirectory = path.join(typingDirectory, 'sessions');
    this.activeSessionFile = path.join(
      typingDirectory,
      'active-session.v1.json'
    );
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
    this.now = options.now ?? Date.now;
  }

  async saveSnapshot(sessionId: string, snapshot: PracticeSnapshot): Promise<void> {
    validateSessionId(sessionId);
    validateSnapshot(snapshot);
    await this.writer.write(
      this.snapshotFile(sessionId),
      serialize(snapshot)
    );
  }

  async getSnapshot(sessionId: string): Promise<PracticeSnapshot | undefined> {
    validateSessionId(sessionId);
    const stored = await readJson<unknown>(this.snapshotFile(sessionId));
    if (stored === undefined) return undefined;
    const value = migratePracticeSnapshot(stored);
    validateSnapshot(value);
    return structuredClone(value);
  }

  async saveCheckpoint(checkpoint: PracticeCheckpoint): Promise<void> {
    validateCheckpoint(checkpoint);
    await this.writer.write(
      this.checkpointFile(checkpoint.session.id),
      serialize(checkpoint)
    );
  }

  async getCheckpoint(sessionId: string): Promise<PracticeCheckpoint | undefined> {
    validateSessionId(sessionId);
    const stored = await readJson<unknown>(this.checkpointFile(sessionId));
    if (stored === undefined) return undefined;
    const value = migratePracticeCheckpoint(stored);
    validateCheckpoint(value);
    if (value.session.id !== sessionId) {
      throw new Error('Practice checkpoint session id does not match its storage path.');
    }
    return structuredClone(value);
  }

  async saveActiveSession(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    const reference: ActivePracticeSessionReference = {
      schemaVersion: 1,
      sessionId,
      updatedAt: this.now()
    };
    await this.writer.write(this.activeSessionFile, serialize(reference));
  }

  async getActiveSession(): Promise<
    ActivePracticeSessionReference | undefined
  > {
    const value = await readJson<unknown>(this.activeSessionFile);
    if (value === undefined) return undefined;
    validateActiveSessionReference(value);
    return structuredClone(value);
  }

  async getActiveSessionId(): Promise<string | undefined> {
    return (await this.getActiveSession())?.sessionId;
  }

  async clearActiveSession(sessionId: string): Promise<boolean> {
    validateSessionId(sessionId);
    const active = await this.getActiveSession();
    if (!active || active.sessionId !== sessionId) return false;
    await unlink(this.activeSessionFile).catch(error => {
      if (!isNotFound(error)) throw error;
    });
    return true;
  }

  private snapshotFile(sessionId: string): string {
    return path.join(this.sessionsDirectory, sessionId, 'snapshot.v1.json');
  }

  private checkpointFile(sessionId: string): string {
    return path.join(this.sessionsDirectory, sessionId, 'checkpoint.v1.json');
  }
}

function validateSessionId(sessionId: string): void {
  if (!SAFE_SESSION_ID.test(sessionId)) {
    throw new Error(`Invalid practice session id: ${sessionId}`);
  }
}

function validateSnapshot(snapshot: PracticeSnapshot): void {
  if (snapshot.schemaVersion !== 1) {
    throw new Error('Unsupported practice snapshot schema version.');
  }
  if (snapshot.id.trim().length === 0) {
    throw new Error('Practice snapshot requires an id.');
  }
}

function validateCheckpoint(checkpoint: PracticeCheckpoint): void {
  if (checkpoint.schemaVersion !== 1) {
    throw new Error('Unsupported practice checkpoint schema version.');
  }
  validateSessionId(checkpoint.session.id);
  if (checkpoint.session.schemaVersion !== 1) {
    throw new Error('Unsupported practice session schema version.');
  }
  if (!Number.isFinite(checkpoint.savedAt)) {
    throw new Error('Practice checkpoint savedAt must be a valid timestamp.');
  }
}

function validateActiveSessionReference(
  value: unknown
): asserts value is ActivePracticeSessionReference {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid active practice session reference.');
  }
  const reference = value as Partial<ActivePracticeSessionReference>;
  if (reference.schemaVersion !== 1) {
    throw new Error('Unsupported active practice session schema version.');
  }
  if (typeof reference.sessionId !== 'string') {
    throw new Error('Active practice session requires a session id.');
  }
  validateSessionId(reference.sessionId);
  if (!Number.isFinite(reference.updatedAt)) {
    throw new Error('Active practice session updatedAt must be a valid timestamp.');
  }
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
