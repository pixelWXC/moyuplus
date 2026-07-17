import type { ReaderPreferences } from '../domain/readerPreferences';
import { createDefaultReaderPreferences } from '../domain/readerPreferences';
import type { GitLogPreferences } from '../git/gitLogModels';
import { createDefaultGitLogPreferences } from '../git/gitLogModels';
import type { ConfigurationSettingSnapshot } from '../settings/settingsAuthority';

export type SettingsSection = 'reader' | 'gitLog' | 'typing' | 'shortcuts';

export interface SettingsSnapshot {
  type: 'settingsSnapshot';
  protocolVersion: 2;
  instanceId: string;
  stateVersion: number;
  section: SettingsSection;
  reader: ReaderPreferences;
  gitLog: GitLogPreferences;
  configuration: ConfigurationSettingSnapshot[];
}

export interface SettingsState {
  phase: 'loading' | 'ready' | 'protocolError';
  instanceId: string;
  stateVersion: number;
  section: SettingsSection;
  reader: ReaderPreferences;
  gitLog: GitLogPreferences;
  configuration: ConfigurationSettingSnapshot[];
  saveStatus?: 'saving' | 'saved' | 'error';
  error?: string;
  resettingSection?: 'reader' | 'gitLog';
  pending: Record<string, { requestId: string; clientRevision: number }>;
}

export type SettingsAction =
  | { type: 'snapshotReceived'; snapshot: SettingsSnapshot }
  | { type: 'localChange'; domain: 'reader' | 'gitLog' | 'configuration'; key: string; value: unknown; requestId: string; clientRevision: number }
  | { type: 'selectSection'; section: SettingsSection }
  | { type: 'resetStarted'; section: 'reader' | 'gitLog' }
  | { type: 'resetFailed'; section: 'reader' | 'gitLog'; message?: string }
  | { type: 'sectionReset'; section: 'reader' | 'gitLog'; value: ReaderPreferences | GitLogPreferences; stateVersion: number }
  | { type: 'changeSaved' | 'changeFailed'; instanceId: string; stateVersion: number; domain: 'reader' | 'gitLog' | 'configuration'; key: string; value: unknown; requestId: string; clientRevision: number; message?: string }
  | { type: 'protocolError'; message: string };

export function createInitialSettingsState(instanceId: string): SettingsState {
  return {
    phase: 'loading', instanceId, stateVersion: 0, section: 'reader',
    reader: createDefaultReaderPreferences(), gitLog: createDefaultGitLogPreferences(), configuration: [], pending: {}
  };
}

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  if (action.type === 'protocolError') {
    return { ...state, phase: 'protocolError', error: action.message };
  }
  if (action.type === 'selectSection') return { ...state, section: action.section };
  if (action.type === 'resetStarted') {
    return { ...state, resettingSection: action.section, saveStatus: 'saving', error: undefined };
  }
  if (action.type === 'resetFailed') {
    if (state.resettingSection !== action.section) return state;
    return {
      ...state,
      resettingSection: undefined,
      saveStatus: 'error',
      error: action.message ?? '恢复默认值失败，请重试。'
    };
  }
  if (action.type === 'sectionReset') {
    return {
      ...state,
      stateVersion: Math.max(state.stateVersion, action.stateVersion),
      ...(action.section === 'reader'
        ? { reader: action.value as ReaderPreferences }
        : { gitLog: action.value as GitLogPreferences }),
      resettingSection: undefined, saveStatus: 'saved', error: undefined
    };
  }
  if (action.type === 'snapshotReceived') {
    const snapshot = action.snapshot;
    if (snapshot.instanceId !== state.instanceId || snapshot.stateVersion <= state.stateVersion) return state;
    return {
      ...state,
      phase: 'ready',
      stateVersion: snapshot.stateVersion,
      section: snapshot.section,
      reader: snapshot.reader,
      gitLog: snapshot.gitLog,
      configuration: snapshot.configuration,
      error: undefined
    };
  }
  const id = `${action.domain}.${action.key}`;
  if (action.type === 'localChange') {
    return {
      ...setDomainValue(state, action.domain, action.key, action.value),
      saveStatus: 'saving',
      pending: { ...state.pending, [id]: { requestId: action.requestId, clientRevision: action.clientRevision } }
    };
  }
  if (action.instanceId !== state.instanceId || action.stateVersion < state.stateVersion) return state;
  const pending = state.pending[id];
  const nextStateVersion = Math.max(state.stateVersion, action.stateVersion);
  if (!pending || pending.requestId !== action.requestId || pending.clientRevision !== action.clientRevision) {
    return nextStateVersion === state.stateVersion ? state : { ...state, stateVersion: nextStateVersion };
  }
  const nextPending = { ...state.pending };
  delete nextPending[id];
  const withValue = setDomainValue(state, action.domain, action.key, action.value);
  return {
    ...withValue,
    stateVersion: nextStateVersion,
    pending: nextPending,
    saveStatus: action.type === 'changeSaved' ? 'saved' : 'error',
    error: action.type === 'changeFailed' ? (action.message ?? '保存失败，请重试。') : undefined
  };
}

function setDomainValue(
  state: SettingsState,
  domain: 'reader' | 'gitLog' | 'configuration',
  key: string,
  value: unknown
): SettingsState {
  if (domain === 'reader') return { ...state, reader: { ...state.reader, [key]: value } as ReaderPreferences };
  if (domain === 'gitLog') return { ...state, gitLog: { ...state.gitLog, [key]: value } as GitLogPreferences };
  return {
    ...state,
    configuration: state.configuration.map(item => item.key === key
      ? { ...item, globalValue: value, globalIsDefault: false }
      : item)
  };
}
