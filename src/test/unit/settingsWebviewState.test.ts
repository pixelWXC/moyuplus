import { describe, expect, it } from 'vitest';
import { SETTINGS_PROTOCOL_VERSION } from '../../settings/settingsMessages';
import { createDefaultReaderPreferences } from '../../domain/readerPreferences';
import { createDefaultImmersiveReaderPreferences } from '../../domain/immersiveReaderPreferences';
import { createDefaultGitLogPreferences } from '../../git/gitLogModels';
import {
  createInitialSettingsState,
  settingsReducer,
  type SettingsSnapshot
} from '../../webview/settingsState';

function snapshot(instanceId: string, stateVersion: number, section: SettingsSnapshot['section'] = 'reader'): SettingsSnapshot {
  return {
    type: 'settingsSnapshot',
    protocolVersion: SETTINGS_PROTOCOL_VERSION,
    instanceId,
    stateVersion,
    section,
    reader: createDefaultReaderPreferences(),
    immersive: createDefaultImmersiveReaderPreferences(),
    gitLog: createDefaultGitLogPreferences()
  };
}

describe('settings Webview state', () => {
  it('stays blocked until the first matching authoritative snapshot', () => {
    const initial = createInitialSettingsState('instance-a');
    expect(initial.phase).toBe('loading');
    expect(settingsReducer(initial, { type: 'snapshotReceived', snapshot: snapshot('instance-b', 1) })).toBe(initial);
    const ready = settingsReducer(initial, { type: 'snapshotReceived', snapshot: snapshot('instance-a', 1) });
    expect(ready).toMatchObject({ phase: 'ready', section: 'reader', stateVersion: 1 });
  });

  it('ignores stale snapshots and switches section only from newer authority', () => {
    let state = settingsReducer(
      createInitialSettingsState('instance-a'),
      { type: 'snapshotReceived', snapshot: snapshot('instance-a', 4, 'gitLog') }
    );
    const stale = settingsReducer(state, { type: 'snapshotReceived', snapshot: snapshot('instance-a', 3, 'reader') });
    expect(stale).toBe(state);
    state = settingsReducer(state, { type: 'snapshotReceived', snapshot: snapshot('instance-a', 5, 'shortcuts') });
    expect(state).toMatchObject({ section: 'shortcuts', stateVersion: 5 });
  });

  it('does not let an older response roll back a newer local change', () => {
    let state = settingsReducer(
      createInitialSettingsState('instance-a'),
      { type: 'snapshotReceived', snapshot: snapshot('instance-a', 1) }
    );
    state = settingsReducer(state, {
      type: 'localChange', domain: 'reader', key: 'fontSize', value: 18,
      requestId: 'request-1', clientRevision: 1
    });
    state = settingsReducer(state, {
      type: 'localChange', domain: 'reader', key: 'fontSize', value: 22,
      requestId: 'request-2', clientRevision: 2
    });
    const stale = settingsReducer(state, {
      type: 'changeFailed', instanceId: 'instance-a', stateVersion: 2,
      domain: 'reader', key: 'fontSize', value: 16,
      requestId: 'request-1', clientRevision: 1, message: '保存失败'
    });
    expect(stale.reader.fontSize).toBe(22);
    const latest = settingsReducer(stale, {
      type: 'changeSaved', instanceId: 'instance-a', stateVersion: 3,
      domain: 'reader', key: 'fontSize', value: 21,
      requestId: 'request-2', clientRevision: 2
    });
    expect(latest).toMatchObject({ stateVersion: 3, saveStatus: 'saved' });
    expect(latest.reader.fontSize).toBe(21);
  });

  it('enters a blocking protocol error state', () => {
    const state = settingsReducer(createInitialSettingsState('instance-a'), {
      type: 'protocolError', message: '请重新加载窗口或更新扩展'
    });
    expect(state).toMatchObject({ phase: 'protocolError', error: '请重新加载窗口或更新扩展' });
  });

  it('keeps an entire section pending until reset succeeds or fails', () => {
    let state = settingsReducer(
      createInitialSettingsState('instance-a'),
      { type: 'snapshotReceived', snapshot: snapshot('instance-a', 1) }
    );
    state = settingsReducer(state, { type: 'resetStarted', section: 'reader' });
    expect(state).toMatchObject({ resettingSection: 'reader', saveStatus: 'saving' });

    state = settingsReducer(state, {
      type: 'resetFailed', section: 'reader', message: 'reset failed'
    });
    expect(state).toMatchObject({ resettingSection: undefined, saveStatus: 'error', error: 'reset failed' });

    state = settingsReducer(state, { type: 'resetStarted', section: 'gitLog' });
    state = settingsReducer(state, {
      type: 'sectionReset', section: 'gitLog', value: createDefaultGitLogPreferences(), stateVersion: 2
    });
    expect(state).toMatchObject({ resettingSection: undefined, saveStatus: 'saved', stateVersion: 2 });
  });
});
