import type { PracticeMaterialRecord } from '../domain/content';

interface DeletedMaterialRecord {
  record: PracticeMaterialRecord;
  deletedAt: number;
}

export interface MaterialRemovalCatalogPort {
  get(materialId: string): PromiseLike<PracticeMaterialRecord | undefined>;
  softDelete(materialId: string): PromiseLike<void>;
  restore(materialId: string): PromiseLike<void>;
  listDeleted(): PromiseLike<DeletedMaterialRecord[]>;
  purgeDeletedBefore(
    cutoff: number,
    protectedMaterialIds?: ReadonlySet<string>
  ): PromiseLike<PracticeMaterialRecord[]>;
  cleanupOrphanedBodies(): PromiseLike<string[]>;
}

export interface PendingMaterialRemoval {
  materialId: string;
  title: string;
  deleteAfter: number;
  waitingForPractice: boolean;
}

export interface MaterialRemovalCoordinatorOptions {
  catalog: MaterialRemovalCatalogPort;
  activeMaterialIds(): PromiseLike<ReadonlySet<string>>;
  now?: () => number;
  undoWindowMs?: number;
  activeRetryMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  onChanged?: () => void | Promise<void>;
  onPurged?: (
    records: readonly PracticeMaterialRecord[]
  ) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

export class MaterialRemovalCoordinator {
  private readonly now: () => number;
  private readonly undoWindowMs: number;
  private readonly activeRetryMs: number;
  private readonly schedule: (callback: () => void, delayMs: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private readonly timers = new Map<string, unknown>();
  private disposed = false;

  constructor(private readonly options: MaterialRemovalCoordinatorOptions) {
    this.now = options.now ?? Date.now;
    this.undoWindowMs = positiveDuration(
      options.undoWindowMs ?? 10_000,
      'Material removal undo window'
    );
    this.activeRetryMs = positiveDuration(
      options.activeRetryMs ?? 5_000,
      'Material removal active retry interval'
    );
    this.schedule = options.schedule ?? ((callback, delayMs) =>
      setTimeout(callback, delayMs));
    this.cancel = options.cancel ?? (handle =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  async initialize(): Promise<void> {
    if (this.disposed) return;
    await this.options.catalog.cleanupOrphanedBodies();
    await this.purgeDueMaterials();
    await this.rearm();
  }

  async remove(materialId: string): Promise<boolean> {
    if (this.disposed) return false;
    const record = await this.options.catalog.get(materialId);
    if (!record) return false;
    await this.options.catalog.softDelete(materialId);
    await this.rearm();
    await this.options.onChanged?.();
    return true;
  }

  async undo(materialId: string): Promise<boolean> {
    if (this.disposed) return false;
    const deleted = await this.findDeleted(materialId);
    if (!deleted) return false;
    await this.options.catalog.restore(materialId);
    this.clearTimer(materialId);
    await this.options.onChanged?.();
    return true;
  }

  async snapshot(): Promise<PendingMaterialRemoval[]> {
    if (this.disposed) return [];
    const [deleted, activeIds] = await Promise.all([
      this.options.catalog.listDeleted(),
      this.options.activeMaterialIds()
    ]);
    return deleted
      .sort((left, right) => right.deletedAt - left.deletedAt)
      .map(entry => ({
        materialId: entry.record.id,
        title: entry.record.title,
        deleteAfter: entry.deletedAt + this.undoWindowMs,
        waitingForPractice: activeIds.has(entry.record.id)
      }));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const handle of this.timers.values()) this.cancel(handle);
    this.timers.clear();
  }

  private async purgeDueMaterials(): Promise<void> {
    const activeIds = await this.options.activeMaterialIds();
    const purged = await this.options.catalog.purgeDeletedBefore(
      this.now() - this.undoWindowMs,
      activeIds
    );
    if (purged.length > 0) await this.options.onPurged?.(purged);
    await this.options.catalog.cleanupOrphanedBodies();
  }

  private async rearm(): Promise<void> {
    if (this.disposed) return;
    for (const handle of this.timers.values()) this.cancel(handle);
    this.timers.clear();
    const [deleted, activeIds] = await Promise.all([
      this.options.catalog.listDeleted(),
      this.options.activeMaterialIds()
    ]);
    for (const entry of deleted) {
      const dueIn = entry.deletedAt + this.undoWindowMs - this.now();
      const delay = activeIds.has(entry.record.id) && dueIn <= 0
        ? this.activeRetryMs
        : Math.max(0, dueIn);
      this.arm(entry.record, delay);
    }
  }

  private arm(record: PracticeMaterialRecord, delayMs: number): void {
    const handle = this.schedule(() => {
      this.timers.delete(record.id);
      void this.onTimer().catch(error => {
        void this.options.onError?.(error);
      });
    }, Math.min(delayMs, 2_147_483_647));
    this.timers.set(record.id, handle);
  }

  private async onTimer(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.purgeDueMaterials();
    } finally {
      await this.rearm();
      await this.options.onChanged?.();
    }
  }

  private async findDeleted(
    materialId: string
  ): Promise<DeletedMaterialRecord | undefined> {
    return (await this.options.catalog.listDeleted())
      .find(entry => entry.record.id === materialId);
  }

  private clearTimer(materialId: string): void {
    const handle = this.timers.get(materialId);
    if (handle !== undefined) this.cancel(handle);
    this.timers.delete(materialId);
  }
}

function positiveDuration(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return value;
}
