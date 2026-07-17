import { describe, expect, it, vi } from 'vitest';
import { createDefaultReaderPreferences } from '../../domain/readerPreferences';
import { createDefaultImmersiveReaderPreferences } from '../../domain/immersiveReaderPreferences';
import { createDefaultGitLogPreferences } from '../../git/gitLogModels';
import {
  SettingsAuthority,
  type ConfigurationInspection,
  type SettingsConfigurationBridge
} from '../../settings/settingsAuthority';

function configurationBridge(): SettingsConfigurationBridge & {
  updates: Array<{ key: string; value: unknown; target: 'global' }>;
} {
  const inspections = new Map<string, ConfigurationInspection>([
    ['moyuplus.shortcuts.enableTabRouter', { defaultValue: false, workspaceValue: true }],
    ['moyuplus.typing.tabMode', { defaultValue: 'completeRest', globalValue: 'replaceLine' }],
    ['moyuplus.shortcuts.enableEnterRouter', { defaultValue: false }],
    ['moyuplus.enter.insertNewLine', { defaultValue: true }],
    ['moyuplus.enter.nextPracticeLine', { defaultValue: false }],
    ['moyuplus.enter.nextReaderPage', { defaultValue: false }]
  ]);
  const updates: Array<{ key: string; value: unknown; target: 'global' }> = [];
  return {
    updates,
    workspaceFolders: () => [{ name: 'alpha', resource: 'alpha-uri' }, { name: 'beta', resource: 'beta-uri' }],
    activeResource: () => 'beta-file-uri',
    workspaceFolderFor: resource => resource === 'beta-file-uri' ? { name: 'beta', resource: 'beta-uri' } : undefined,
    inspect: (key, resource) => {
      if (resource === 'alpha-uri' && key === 'moyuplus.shortcuts.enableTabRouter') {
        return { ...inspections.get(key)!, workspaceFolderValue: false };
      }
      if (resource === 'beta-uri' && key === 'moyuplus.shortcuts.enableTabRouter') {
        return { ...inspections.get(key)!, workspaceFolderValue: true };
      }
      return inspections.get(key)!;
    },
    effectiveValue: (key, resource) => {
      const inspected = resource ? (resource === 'alpha-uri'
        ? { ...inspections.get(key)!, workspaceFolderValue: key.endsWith('enableTabRouter') ? false : undefined }
        : { ...inspections.get(key)!, workspaceFolderValue: key.endsWith('enableTabRouter') ? true : undefined }) : inspections.get(key)!;
      return inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue ?? inspected.defaultValue;
    },
    updateGlobal: async (key, value) => {
      updates.push({ key, value, target: 'global' });
      inspections.set(key, { ...inspections.get(key)!, globalValue: value });
    }
  };
}

function authority() {
  let reader = createDefaultReaderPreferences();
  let immersive = createDefaultImmersiveReaderPreferences();
  let gitLog = createDefaultGitLogPreferences();
  const onReaderSaved = vi.fn();
  const onImmersiveSaved = vi.fn();
  const onGitLogSaved = vi.fn();
  const configuration = configurationBridge();
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
    configuration,
    onReaderSaved,
    onImmersiveSaved,
    onGitLogSaved
  });
  return { value, configuration, onReaderSaved, onImmersiveSaved, onGitLogSaved };
}

describe('settings authority', () => {
  it('builds all 29 settings and keeps global values separate from narrower overrides', () => {
    const { value } = authority();
    const snapshot = value.snapshot('typing');
    expect(Object.keys(snapshot.reader)).toHaveLength(10);
    expect(Object.keys(snapshot.gitLog)).toHaveLength(6);
    expect(Object.keys(snapshot.immersive)).toHaveLength(7);
    expect(snapshot.configuration).toHaveLength(6);
    expect(snapshot.section).toBe('typing');

    const tab = snapshot.configuration.find(item => item.key === 'moyuplus.shortcuts.enableTabRouter')!;
    expect(tab).toMatchObject({ globalValue: false, globalIsDefault: true, workspaceValue: true, overridden: true });
    expect(tab.folders).toEqual([
      expect.objectContaining({ name: 'alpha', workspaceFolderValue: false, effectiveValue: false }),
      expect.objectContaining({ name: 'beta', workspaceFolderValue: true, effectiveValue: true })
    ]);
    expect(tab.activeResource).toEqual({ folderName: 'beta', effectiveValue: true });

    const tabMode = snapshot.configuration.find(item => item.key === 'moyuplus.typing.tabMode')!;
    expect(tabMode).toMatchObject({ globalValue: 'replaceLine', globalIsDefault: false });
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

  it('writes configuration only to the global target and returns the global authority', async () => {
    const { value, configuration } = authority();
    expect(await value.change('configuration', 'moyuplus.shortcuts.enableTabRouter', true)).toBe(true);
    expect(configuration.updates).toEqual([
      { key: 'moyuplus.shortcuts.enableTabRouter', value: true, target: 'global' }
    ]);
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
