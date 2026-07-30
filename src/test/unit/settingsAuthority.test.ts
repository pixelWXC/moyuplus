import { describe, expect, it, vi } from 'vitest';
import { createDefaultReaderPreferences } from '../../domain/readerPreferences';
import { createDefaultImmersiveReaderPreferences } from '../../domain/immersiveReaderPreferences';
import { createDefaultGitLogPreferences } from '../../git/gitLogModels';
import { SettingsAuthority } from '../../settings/settingsAuthority';

function authority() {
  let reader = createDefaultReaderPreferences();
  let immersive = createDefaultImmersiveReaderPreferences();
  let gitLog = createDefaultGitLogPreferences();
  const onReaderSaved = vi.fn();
  const onImmersiveSaved = vi.fn();
  const onGitLogSaved = vi.fn();
  const value = new SettingsAuthority({
    readerStore: {
      get: () => reader,
      save: async next => (reader = next)
    },
    immersiveStore: {
      get: () => immersive,
      save: async next => (immersive = next)
    },
    gitLogStore: {
      get: () => gitLog,
      save: async next => (gitLog = next)
    },
    onReaderSaved,
    onImmersiveSaved,
    onGitLogSaved
  });
  return { value, onReaderSaved, onImmersiveSaved, onGitLogSaved };
}

describe('settings authority', () => {
  it('builds only plugin-owned preference sections', () => {
    const { value } = authority();
    const snapshot = value.snapshot('reader');
    expect(Object.keys(snapshot.reader)).toHaveLength(10);
    expect(Object.keys(snapshot.gitLog)).toHaveLength(6);
    expect(Object.keys(snapshot.immersive)).toHaveLength(7);
    expect(snapshot).not.toHaveProperty('configuration');
    expect(snapshot.section).toBe('reader');
  });

  it('persists normalized reader and Git Log changes and notifies the active view', async () => {
    const { value, onReaderSaved, onImmersiveSaved, onGitLogSaved } = authority();
    expect(await value.change('reader', 'fontSize', 21)).toBe(21);
    expect(await value.change('gitLog', 'maxCommits', 300)).toBe(300);
    expect(await value.change('immersive', 'visualLines', 5)).toBe(5);
    expect(onReaderSaved).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 21 }));
    expect(onGitLogSaved).toHaveBeenCalledWith(
      expect.objectContaining({ maxCommits: 300 }),
      expect.objectContaining({ maxCommits: 200 })
    );
    expect(onImmersiveSaved).toHaveBeenCalledWith(expect.objectContaining({ visualLines: 5 }));
  });

  it('resets a whole preference section as one store transaction', async () => {
    const { value, onReaderSaved } = authority();
    await value.change('reader', 'fontSize', 24);
    const reset = await value.reset('reader');
    expect(reset).toEqual(createDefaultReaderPreferences());
    expect(onReaderSaved).toHaveBeenLastCalledWith(createDefaultReaderPreferences());
    await value.change('immersive', 'italic', true);
    expect(await value.reset('immersive')).toEqual(createDefaultImmersiveReaderPreferences());
  });
});
