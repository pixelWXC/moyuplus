import { describe, expect, it, vi } from 'vitest';
import { createDefaultGitLogPreferences } from '../../git/gitLogModels';
import { GitLogModeStore } from '../../storage/gitLogModeStore';
import { GitLogPreferencesStore } from '../../storage/gitLogPreferencesStore';
import { GIT_LOG_MODE_KEY, GIT_LOG_PREFERENCES_KEY } from '../../storage/storageKeys';

class MemoryMemento {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

const resumeTarget = {
  bookId: 'book-1',
  locator: { kind: 'txt' as const, sectionId: 's1', progression: 0.4, offset: 12 },
  bookProgression: 0.3
};

describe('Git Log stores', () => {
  it('persists normalized display preferences globally', async () => {
    const state = new MemoryMemento();
    const store = new GitLogPreferencesStore(state);
    expect(store.get()).toEqual(createDefaultGitLogPreferences());
    await store.save({ ...createDefaultGitLogPreferences(), layout: 'inline', maxCommits: 5000 });
    expect(state.values.get(GIT_LOG_PREFERENCES_KEY)).toEqual({
      ...createDefaultGitLogPreferences(), layout: 'inline', maxCommits: 1000
    });
  });

  it('keeps the workspace lock and minimal resume target without Git session data', async () => {
    const state = new MemoryMemento();
    const store = new GitLogModeStore(state);
    await store.save({ active: true, resumeTarget });
    expect(store.get()).toEqual({ active: true, resumeTarget });
    expect(state.values.get(GIT_LOG_MODE_KEY)).toEqual({ active: true, resumeTarget });
  });

  it('claims a pending resume target only after clearing it persistently', async () => {
    const state = new MemoryMemento();
    const store = new GitLogModeStore(state);
    await store.save({ active: false, resumeTarget });
    await expect(store.claimResumeTarget()).resolves.toEqual(resumeTarget);
    expect(store.get()).toEqual({ active: false });
    await expect(store.claimResumeTarget()).resolves.toBeUndefined();
  });

  it('does not return a resume target when the clearing write fails', async () => {
    const state = new MemoryMemento();
    const store = new GitLogModeStore(state);
    await store.save({ active: false, resumeTarget });
    state.update = vi.fn().mockRejectedValue(new Error('write failed'));
    await expect(store.claimResumeTarget()).rejects.toThrow('write failed');
    expect(store.get()).toEqual({ active: false, resumeTarget });
  });
});
