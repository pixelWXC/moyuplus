import { describe, expect, it, vi } from 'vitest';
import {
  MaterialRemovalCoordinator,
  type PracticeMaterialRecord
} from '../../typing';

describe('MaterialRemovalCoordinator', () => {
  it('soft deletes immediately and restores during the undo window', async () => {
    const harness = createHarness();
    await harness.coordinator.initialize();

    await expect(harness.coordinator.remove('material-a')).resolves.toBe(true);
    await expect(harness.coordinator.snapshot()).resolves.toEqual([{
      materialId: 'material-a',
      title: '长文素材',
      deleteAfter: 11_000,
      waitingForPractice: false
    }]);

    await expect(harness.coordinator.undo('material-a')).resolves.toBe(true);
    await expect(harness.coordinator.snapshot()).resolves.toEqual([]);
    expect(harness.catalog.records.has('material-a')).toBe(true);
  });

  it('waits for an active practice and permanently purges after it ends', async () => {
    const harness = createHarness();
    harness.activeIds.add('material-a');
    await harness.coordinator.initialize();
    await harness.coordinator.remove('material-a');

    harness.setNow(11_000);
    harness.runLatestTimer();
    await vi.waitFor(async () => {
      expect((await harness.coordinator.snapshot())[0]?.waitingForPractice).toBe(true);
    });
    expect(harness.catalog.deleted.has('material-a')).toBe(true);

    harness.activeIds.clear();
    harness.setNow(16_000);
    harness.runLatestTimer();
    await vi.waitFor(() => {
      expect(harness.catalog.deleted.has('material-a')).toBe(false);
    });
    await expect(harness.coordinator.snapshot()).resolves.toEqual([]);
    expect(harness.catalog.records.has('material-a')).toBe(false);
  });
});

function createHarness() {
  let now = 1_000;
  const record = material();
  const records = new Map([[record.id, record]]);
  const deleted = new Map<string, {
    record: PracticeMaterialRecord;
    deletedAt: number;
  }>();
  const catalog = {
    records,
    deleted,
    get: async (materialId: string) => (
      deleted.has(materialId)
        ? undefined
        : structuredClone(records.get(materialId))
    ),
    softDelete: async (materialId: string) => {
      const value = records.get(materialId);
      if (!value) throw new Error('missing material');
      deleted.set(materialId, {
        record: structuredClone(value),
        deletedAt: now
      });
    },
    restore: async (materialId: string) => {
      if (!deleted.delete(materialId)) throw new Error('missing deletion');
    },
    listDeleted: async () => [...deleted.values()].map(value => structuredClone(value)),
    purgeDeletedBefore: async (
      cutoff: number,
      protectedIds: ReadonlySet<string> = new Set()
    ) => {
      const purged: PracticeMaterialRecord[] = [];
      for (const [id, value] of deleted) {
        if (value.deletedAt > cutoff || protectedIds.has(id)) continue;
        purged.push(structuredClone(value.record));
        deleted.delete(id);
        records.delete(id);
      }
      return purged;
    },
    cleanupOrphanedBodies: async () => []
  };
  const activeIds = new Set<string>();
  const timers: Array<{
    callback: () => void;
    cancelled: boolean;
  }> = [];
  const coordinator = new MaterialRemovalCoordinator({
    catalog,
    activeMaterialIds: async () => new Set(activeIds),
    now: () => now,
    undoWindowMs: 10_000,
    activeRetryMs: 5_000,
    schedule: callback => {
      const handle = { callback, cancelled: false };
      timers.push(handle);
      return handle;
    },
    cancel: value => {
      (value as { cancelled: boolean }).cancelled = true;
    }
  });
  return {
    coordinator,
    catalog,
    activeIds,
    setNow(value: number) {
      now = value;
    },
    runLatestTimer() {
      const timer = [...timers].reverse().find(value => !value.cancelled);
      if (!timer) throw new Error('No active material removal timer.');
      timer.callback();
    }
  };
}

function material(): PracticeMaterialRecord {
  return {
    schemaVersion: 1,
    id: 'material-a',
    revision: 'r1',
    title: '长文素材',
    origin: 'txtImport',
    contentProfile: { kind: 'chinese', category: 'adHoc' },
    tags: [],
    source: { kind: 'managed', bodyRevision: 'r1' },
    counts: {
      graphemes: 100,
      hanGraphemes: 100,
      englishWords: 0,
      printableUnits: 100
    },
    estimatedSeconds: 100,
    createdAt: 1,
    updatedAt: 1
  };
}
