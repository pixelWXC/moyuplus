import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';
import { MaterialLock } from './MaterialLock';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const DEFAULT_SESSION_LEASE_TIMEOUT_MS = 15_000;

export interface SessionLease {
  schemaVersion: 1;
  sessionId: string;
  ownerId: string;
  heartbeat: number;
  updatedAt: number;
}

export type SessionLeaseAcquireResult =
  | {
    acquired: true;
    takenOver: boolean;
    lease: SessionLease;
  }
  | {
    acquired: false;
    lease: SessionLease;
  };

export interface SessionLeaseInspection {
  lease: SessionLease;
  active: boolean;
}

export interface SessionLeaseStoreOptions {
  ownerId: string;
  now?: () => number;
  timeoutMs?: number;
  acquireTimeoutMs?: number;
  retryDelayMs?: number;
  atomicWriter?: AtomicFileWriterPort;
  ownerIsAlive?: (ownerId: string) => boolean;
}

export class SessionLeaseStore {
  private readonly leaseFile: string;
  private readonly ownerId: string;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly ownerIsAlive: (ownerId: string) => boolean;
  private readonly writer: AtomicFileWriterPort;
  private readonly updateLock: MaterialLock;

  constructor(
    workspaceStorageDirectory: string,
    options: SessionLeaseStoreOptions
  ) {
    validateId(options.ownerId, 'owner');
    const typingDirectory = path.join(
      path.resolve(workspaceStorageDirectory),
      'typing'
    );
    this.leaseFile = path.join(typingDirectory, 'lease.v1.json');
    this.ownerId = options.ownerId;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_SESSION_LEASE_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('Session lease timeout must be a positive duration.');
    }
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
    this.ownerIsAlive = options.ownerIsAlive ?? (() => true);
    this.updateLock = new MaterialLock(
      path.join(typingDirectory, '.lease-coordination'),
      {
        ownerId: options.ownerId,
        now: this.now,
        lockTimeoutMs: Math.min(this.timeoutMs, 5_000),
        acquireTimeoutMs: options.acquireTimeoutMs ?? 5_000,
        retryDelayMs: options.retryDelayMs ?? 10
      }
    );
  }

  async acquire(sessionId: string): Promise<SessionLeaseAcquireResult> {
    validateId(sessionId, 'session');
    return this.updateLock.runExclusive(async () => {
      const current = await this.read();
      if (
        current?.ownerId === this.ownerId
        && current.sessionId === sessionId
      ) {
        return {
          acquired: true,
          takenOver: false,
          lease: current
        };
      }
      if (current && this.isActive(current)) {
        return {
          acquired: false,
          lease: current
        };
      }
      const lease: SessionLease = {
        schemaVersion: 1,
        sessionId,
        ownerId: this.ownerId,
        heartbeat: 0,
        updatedAt: this.now()
      };
      await this.write(lease);
      return {
        acquired: true,
        takenOver: current !== undefined,
        lease: structuredClone(lease)
      };
    });
  }

  async claimExpired(sessionId: string): Promise<boolean> {
    validateId(sessionId, 'session');
    return this.updateLock.runExclusive(async () => {
      const current = await this.read();
      if (
        !current
        || current.sessionId !== sessionId
        || this.isActive(current)
      ) {
        return false;
      }
      await this.write({
        schemaVersion: 1,
        sessionId,
        ownerId: this.ownerId,
        heartbeat: 0,
        updatedAt: this.now()
      });
      return true;
    });
  }

  async claimRecoverable(sessionId: string): Promise<boolean> {
    validateId(sessionId, 'session');
    return this.updateLock.runExclusive(async () => {
      const current = await this.read();
      if (
        current
        && (
          current.sessionId !== sessionId
          || this.isActive(current)
        )
      ) {
        return false;
      }
      await this.write({
        schemaVersion: 1,
        sessionId,
        ownerId: this.ownerId,
        heartbeat: 0,
        updatedAt: this.now()
      });
      return true;
    });
  }

  async heartbeat(sessionId: string): Promise<SessionLease> {
    validateId(sessionId, 'session');
    return this.updateLock.runExclusive(async () => {
      const current = await this.read();
      if (
        current?.ownerId !== this.ownerId
        || current.sessionId !== sessionId
      ) {
        throw new Error('Cannot heartbeat a session lease owned by another window.');
      }
      const lease: SessionLease = {
        ...current,
        heartbeat: current.heartbeat + 1,
        updatedAt: this.now()
      };
      await this.write(lease);
      return structuredClone(lease);
    });
  }

  async transition(
    currentSessionId: string,
    nextSessionId: string
  ): Promise<SessionLease> {
    validateId(currentSessionId, 'session');
    validateId(nextSessionId, 'session');
    return this.updateLock.runExclusive(async () => {
      const current = await this.read();
      if (
        current?.ownerId !== this.ownerId
        || current.sessionId !== currentSessionId
      ) {
        throw new Error(
          'Cannot transition a session lease owned by another window.'
        );
      }
      const lease: SessionLease = {
        schemaVersion: 1,
        sessionId: nextSessionId,
        ownerId: this.ownerId,
        heartbeat: 0,
        updatedAt: this.now()
      };
      await this.write(lease);
      return structuredClone(lease);
    });
  }

  async release(sessionId: string): Promise<boolean> {
    validateId(sessionId, 'session');
    return this.updateLock.runExclusive(async () => {
      const current = await this.read();
      if (
        current?.ownerId !== this.ownerId
        || current.sessionId !== sessionId
      ) {
        return false;
      }
      await unlink(this.leaseFile).catch(error => {
        if (!isNotFound(error)) throw error;
      });
      return true;
    });
  }

  async read(): Promise<SessionLease | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.leaseFile, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
    const value = JSON.parse(raw) as SessionLease;
    validateLease(value);
    return structuredClone(value);
  }

  async inspect(): Promise<SessionLeaseInspection | undefined> {
    const lease = await this.read();
    return lease
      ? {
        lease,
        active: this.isActive(lease)
      }
      : undefined;
  }

  private isActive(lease: SessionLease): boolean {
    return this.ownerIsAlive(lease.ownerId)
      && this.now() - lease.updatedAt <= this.timeoutMs;
  }

  private async write(lease: SessionLease): Promise<void> {
    await this.writer.write(
      this.leaseFile,
      `${JSON.stringify(lease, undefined, 2)}\n`
    );
  }
}

function validateLease(lease: SessionLease): void {
  if (lease.schemaVersion !== 1) {
    throw new Error('Unsupported session lease schema version.');
  }
  validateId(lease.sessionId, 'session');
  validateId(lease.ownerId, 'owner');
  if (!Number.isInteger(lease.heartbeat) || lease.heartbeat < 0) {
    throw new Error('Session lease heartbeat must be a non-negative integer.');
  }
  if (!Number.isFinite(lease.updatedAt)) {
    throw new Error('Session lease updatedAt must be a valid timestamp.');
  }
}

function validateId(id: string, kind: 'owner' | 'session'): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid practice ${kind} id: ${id}`);
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export interface SessionLeaseHeartbeatOptions {
  sessionId: string;
  lease: Pick<SessionLeaseStore, 'heartbeat' | 'release'>;
  intervalMs?: number;
  schedule?: (
    callback: () => void | Promise<void>,
    delayMs: number
  ) => unknown;
  cancel?: (handle: unknown) => void;
  onError?: (error: unknown) => void | Promise<void>;
}

export class SessionLeaseHeartbeat {
  private readonly intervalMs: number;
  private readonly schedule: (
    callback: () => void | Promise<void>,
    delayMs: number
  ) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private running = false;
  private handle: unknown;

  constructor(private readonly options: SessionLeaseHeartbeatOptions) {
    this.intervalMs = options.intervalMs ?? 5_000;
    if (!Number.isFinite(this.intervalMs) || this.intervalMs <= 0) {
      throw new Error('Session lease heartbeat interval must be positive.');
    }
    this.schedule = options.schedule ?? ((callback, delayMs) =>
      setTimeout(() => { void callback(); }, delayMs));
    this.cancel = options.cancel ?? (handle => clearTimeout(
      handle as ReturnType<typeof setTimeout>
    ));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  async stop(options: { release?: boolean } = {}): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== undefined) {
      this.cancel(this.handle);
      this.handle = undefined;
    }
    if (options.release !== false) {
      await this.options.lease.release(this.options.sessionId);
    }
  }

  private scheduleNext(): void {
    this.handle = this.schedule(async () => {
      this.handle = undefined;
      if (!this.running) return;
      try {
        await this.options.lease.heartbeat(this.options.sessionId);
      } catch (error) {
        this.running = false;
        await this.options.onError?.(error);
        return;
      }
      if (this.running) this.scheduleNext();
    }, this.intervalMs);
  }
}
