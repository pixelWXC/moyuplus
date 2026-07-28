import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink
} from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

interface MaterialLockRecord {
  schemaVersion: 1;
  ownerId: string;
  token?: string;
  acquiredAt: number;
}

export interface MaterialLockOptions {
  ownerId: string;
  now?: () => number;
  lockTimeoutMs?: number;
  acquireTimeoutMs?: number;
  retryDelayMs?: number;
}

export class MaterialLock {
  private readonly lockFile: string;
  private readonly recoveredDirectory: string;
  private readonly now: () => number;
  private readonly lockTimeoutMs: number;
  private readonly acquireTimeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly materialsDirectory: string,
    private readonly options: MaterialLockOptions
  ) {
    if (options.ownerId.trim().length === 0) {
      throw new Error('Material lock requires an owner id.');
    }
    this.lockFile = path.join(materialsDirectory, 'catalog.lock');
    this.recoveredDirectory = path.join(materialsDirectory, 'recovered-locks');
    this.now = options.now ?? Date.now;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 30_000;
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? 5_000;
    this.retryDelayMs = options.retryDelayMs ?? 10;
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const token = await this.acquire();
    try {
      return await operation();
    } finally {
      await this.release(token);
    }
  }

  private async acquire(): Promise<string> {
    await mkdir(this.materialsDirectory, { recursive: true });
    const startedAt = Date.now();
    while (Date.now() - startedAt <= this.acquireTimeoutMs) {
      const token = randomUUID();
      const record: MaterialLockRecord = {
        schemaVersion: 1,
        ownerId: this.options.ownerId,
        token,
        acquiredAt: this.now()
      };
      try {
        const handle = await open(this.lockFile, 'wx');
        try {
          await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        return token;
      } catch (error) {
        if (!isAlreadyExists(error)) {
          throw error;
        }
      }

      const recovered = await this.recoverIfStale();
      if (!recovered) {
        await delay(this.retryDelayMs);
      }
    }
    throw new Error('Timed out acquiring the material catalog lock.');
  }

  private async recoverIfStale(): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(this.lockFile, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return true;
      throw error;
    }
    const record = parseLockRecord(raw);
    if (!record || this.now() - record.acquiredAt <= this.lockTimeoutMs) {
      return false;
    }

    await mkdir(this.recoveredDirectory, { recursive: true });
    const recovered = path.join(
      this.recoveredDirectory,
      `catalog-lock-${this.now()}-${randomUUID()}.json`
    );
    try {
      await rename(this.lockFile, recovered);
      return true;
    } catch (error) {
      if (isNotFound(error)) return true;
      throw error;
    }
  }

  private async release(token: string): Promise<void> {
    let record: MaterialLockRecord | undefined;
    try {
      record = parseLockRecord(await readFile(this.lockFile, 'utf8'));
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
    if (record?.ownerId !== this.options.ownerId || record.token !== token) {
      return;
    }
    await unlink(this.lockFile).catch(error => {
      if (!isNotFound(error)) throw error;
    });
  }
}

function parseLockRecord(raw: string): MaterialLockRecord | undefined {
  try {
    const value = JSON.parse(raw) as Partial<MaterialLockRecord>;
    if (
      value.schemaVersion !== 1
      || typeof value.ownerId !== 'string'
      || typeof value.acquiredAt !== 'number'
      || !Number.isFinite(value.acquiredAt)
    ) {
      return undefined;
    }
    return {
      schemaVersion: 1,
      ownerId: value.ownerId,
      token: typeof value.token === 'string' ? value.token : undefined,
      acquiredAt: value.acquiredAt
    };
  } catch {
    return undefined;
  }
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error) && error.code === 'EEXIST';
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
