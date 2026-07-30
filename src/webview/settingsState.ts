import type { ReaderPreferences } from '../domain/readerPreferences';
import { createDefaultReaderPreferences } from '../domain/readerPreferences';
import type { ImmersiveReaderPreferences } from '../domain/immersiveReaderPreferences';
import { createDefaultImmersiveReaderPreferences } from '../domain/immersiveReaderPreferences';
import type { GitLogPreferences } from '../git/gitLogModels';
import { createDefaultGitLogPreferences } from '../git/gitLogModels';

export type SettingsSection = 'reader' | 'immersive' | 'gitLog' | 'shortcuts';

export interface SettingsSnapshot {
  type: 'settingsSnapshot';
  protocolVersion: 2;
  instanceId: string;
  stateVersion: number;
  section: SettingsSection;
  reader: ReaderPreferences;
  immersive: ImmersiveReaderPreferences;
  gitLog: GitLogPreferences;
}

export interface SettingsState {
  phase: 'loading' | 'ready' | 'protocolError';
  instanceId: string;
  stateVersion: number;
  section: SettingsSection;
  reader: ReaderPreferences;
  immersive: ImmersiveReaderPreferences;
  gitLog: GitLogPreferences;
  saveStatus?: 'saving' | 'saved' | 'error';
  error?: string;
  resettingSection?: 'reader' | 'immersive' | 'gitLog';
  pending: Record<string, { requestId: string; clientRevision: number }>;
}

export type SettingsAction =
  | { type: 'snapshotReceived'; snapshot: SettingsSnapshot }
  | { type: 'localChange'; domain: 'reader' | 'immersive' | 'gitLog'; key: string; value: unknown; requestId: string; clientRevision: number }
  | { type: 'selectSection'; section: SettingsSection }
  | { type: 'resetStarted'; section: 'reader' | 'immersive' | 'gitLog' }
  | { type: 'resetFailed'; section: 'reader' | 'immersive' | 'gitLog'; message?: string }
  | { type: 'sectionReset'; section: 'reader' | 'immersive' | 'gitLog'; value: ReaderPreferences | ImmersiveReaderPreferences | GitLogPreferences; stateVersion: number }
  | { type: 'changeSaved' | 'changeFailed'; instanceId: string; stateVersion: number; domain: 'reader' | 'immersive' | 'gitLog'; key: string; value: unknown; requestId: string; clientRevision: number; message?: string }
  | { type: 'protocolError'; message: string };

export function createInitialSettingsState(instanceId: string): SettingsState {
  return {
    phase: 'loading', instanceId, stateVersion: 0, section: 'reader',
    reader: createDefaultReaderPreferences(), immersive: createDefaultImmersiveReaderPreferences(), gitLog: createDefaultGitLogPreferences(), pending: {}
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
        : action.section === 'immersive'
          ? { immersive: action.value as ImmersiveReaderPreferences }
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
      immersive: snapshot.immersive,
      gitLog: snapshot.gitLog,
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
  domain: 'reader' | 'immersive' | 'gitLog',
  key: string,
  value: unknown
): SettingsState {
  if (domain === 'reader') return { ...state, reader: { ...state.reader, [key]: value } as ReaderPreferences };
  if (domain === 'immersive') return { ...state, immersive: { ...state.immersive, [key]: value } as ImmersiveReaderPreferences };
  return { ...state, gitLog: { ...state.gitLog, [key]: value } as GitLogPreferences };
}
