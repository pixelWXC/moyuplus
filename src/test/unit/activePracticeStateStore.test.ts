import { describe, expect, it } from 'vitest';
import {
  ActivePracticeStateStore
} from '../../typing/adapters/view';

describe('ActivePracticeStateStore', () => {
  it('keeps coordinator snapshots and exposes only resumable sessions as active', async () => {
    const store = new ActivePracticeStateStore();
    const snapshot = {
      schemaVersion: 1,
      id: 'snapshot-1'
    } as never;
    await store.snapshots.save(snapshot);
    await expect(store.snapshots.get('snapshot-1')).resolves.toEqual(snapshot);

    await store.sessions.save({
      schemaVersion: 1,
      id: 'session-1',
      snapshotId: 'snapshot-1',
      status: 'running',
      updatedAt: 100
    } as never);
    await expect(store.current()).resolves.toEqual({
      id: 'session-1',
      status: 'running'
    });
    await expect(store.currentSession()).resolves.toEqual(
      expect.objectContaining({
        id: 'session-1',
        snapshotId: 'snapshot-1',
        status: 'running'
      })
    );

    await store.sessions.save({
      schemaVersion: 1,
      id: 'session-1',
      snapshotId: 'snapshot-1',
      status: 'completed',
      updatedAt: 200
    } as never);
    await expect(store.current()).resolves.toBeUndefined();
  });
});
