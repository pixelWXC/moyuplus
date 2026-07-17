import {
  createDefaultReaderPreferences,
  normalizeReaderPreferences,
  type ReaderPreferences
} from '../domain/readerPreferences';
import {
  createDefaultGitLogPreferences,
  normalizeGitLogPreferences,
  type GitLogPreferences
} from '../git/gitLogModels';
import type { SettingsSection } from './settingsMessages';

export interface ConfigurationInspection {
  defaultValue: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
}

export interface SettingsWorkspaceFolder {
  name: string;
  resource: unknown;
}

export interface SettingsConfigurationBridge {
  workspaceFolders(): SettingsWorkspaceFolder[];
  activeResource(): unknown | undefined;
  workspaceFolderFor(resource: unknown): SettingsWorkspaceFolder | undefined;
  inspect(key: string, resource?: unknown): ConfigurationInspection;
  effectiveValue(key: string, resource?: unknown): unknown;
  updateGlobal(key: string, value: unknown): Promise<void>;
}

export interface SettingsAuthorityDependencies {
  readerStore: { get(): ReaderPreferences; save(value: ReaderPreferences): Promise<ReaderPreferences> };
  gitLogStore: { get(): GitLogPreferences; save(value: GitLogPreferences): Promise<GitLogPreferences> };
  configuration: SettingsConfigurationBridge;
  onReaderSaved?(value: ReaderPreferences): void | PromiseLike<void>;
  onGitLogSaved?(value: GitLogPreferences, previous: GitLogPreferences): void | PromiseLike<void>;
}

export const SETTINGS_CONFIGURATION_KEYS = [
  'moyuplus.shortcuts.enableTabRouter',
  'moyuplus.typing.tabMode',
  'moyuplus.shortcuts.enableEnterRouter',
  'moyuplus.enter.insertNewLine',
  'moyuplus.enter.nextPracticeLine',
  'moyuplus.enter.nextReaderPage'
] as const;

export type SettingsConfigurationKey = typeof SETTINGS_CONFIGURATION_KEYS[number];

export interface ConfigurationFolderSnapshot {
  name: string;
  workspaceFolderValue?: unknown;
  effectiveValue: unknown;
}

export interface ConfigurationSettingSnapshot {
  key: SettingsConfigurationKey;
  defaultValue: unknown;
  globalValue: unknown;
  globalIsDefault: boolean;
  workspaceValue?: unknown;
  folders: ConfigurationFolderSnapshot[];
  activeResource?: { folderName?: string; effectiveValue: unknown };
  overridden: boolean;
}

export interface AuthoritySnapshot {
  section: SettingsSection;
  reader: ReaderPreferences;
  gitLog: GitLogPreferences;
  configuration: ConfigurationSettingSnapshot[];
}

export class SettingsAuthority {
  constructor(private readonly dependencies: SettingsAuthorityDependencies) {}

  snapshot(section: SettingsSection): AuthoritySnapshot {
    return {
      section,
      reader: normalizeReaderPreferences(this.dependencies.readerStore.get()),
      gitLog: normalizeGitLogPreferences(this.dependencies.gitLogStore.get()),
      configuration: SETTINGS_CONFIGURATION_KEYS.map(key => this.configurationSnapshot(key))
    };
  }

  async change(domain: 'reader' | 'gitLog' | 'configuration', key: string, value: unknown): Promise<unknown> {
    if (domain === 'reader') {
      const next = normalizeReaderPreferences({ ...this.dependencies.readerStore.get(), [key]: value });
      const saved = await this.dependencies.readerStore.save(next);
      await this.dependencies.onReaderSaved?.(saved);
      return saved[key as keyof ReaderPreferences];
    }
    if (domain === 'gitLog') {
      const previous = normalizeGitLogPreferences(this.dependencies.gitLogStore.get());
      const next = normalizeGitLogPreferences({ ...previous, [key]: value });
      const saved = await this.dependencies.gitLogStore.save(next);
      await this.dependencies.onGitLogSaved?.(saved, previous);
      return saved[key as keyof GitLogPreferences];
    }
    await this.dependencies.configuration.updateGlobal(key, value);
    const inspected = this.dependencies.configuration.inspect(key);
    return inspected.globalValue ?? inspected.defaultValue;
  }

  async reset(section: 'reader' | 'gitLog'): Promise<ReaderPreferences | GitLogPreferences> {
    if (section === 'reader') {
      const saved = await this.dependencies.readerStore.save(normalizeReaderPreferences(createDefaultReaderPreferences()));
      await this.dependencies.onReaderSaved?.(saved);
      return saved;
    }
    const previous = normalizeGitLogPreferences(this.dependencies.gitLogStore.get());
    const saved = await this.dependencies.gitLogStore.save(normalizeGitLogPreferences(createDefaultGitLogPreferences()));
    await this.dependencies.onGitLogSaved?.(saved, previous);
    return saved;
  }

  private configurationSnapshot(key: SettingsConfigurationKey): ConfigurationSettingSnapshot {
    const bridge = this.dependencies.configuration;
    const inspected = bridge.inspect(key);
    const folders = bridge.workspaceFolders().flatMap(folder => {
      const folderInspection = bridge.inspect(key, folder.resource);
      return folderInspection.workspaceFolderValue === undefined ? [] : [{
        name: folder.name,
        workspaceFolderValue: folderInspection.workspaceFolderValue,
        effectiveValue: bridge.effectiveValue(key, folder.resource)
      }];
    });
    const active = bridge.activeResource();
    const activeFolder = active === undefined ? undefined : bridge.workspaceFolderFor(active);
    return {
      key,
      defaultValue: inspected.defaultValue,
      globalValue: inspected.globalValue ?? inspected.defaultValue,
      globalIsDefault: inspected.globalValue === undefined,
      ...(inspected.workspaceValue === undefined ? {} : { workspaceValue: inspected.workspaceValue }),
      folders,
      ...(active === undefined ? {} : {
        activeResource: {
          ...(activeFolder ? { folderName: activeFolder.name } : {}),
          effectiveValue: bridge.effectiveValue(key, active)
        }
      }),
      overridden: inspected.workspaceValue !== undefined || folders.length > 0
    };
  }
}
