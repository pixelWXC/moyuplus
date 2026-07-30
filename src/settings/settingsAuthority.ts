import {
  createDefaultReaderPreferences,
  normalizeReaderPreferences,
  type ReaderPreferences
} from '../domain/readerPreferences';
import {
  createDefaultImmersiveReaderPreferences,
  normalizeImmersiveReaderPreferences,
  type ImmersiveReaderPreferences
} from '../domain/immersiveReaderPreferences';
import {
  createDefaultGitLogPreferences,
  normalizeGitLogPreferences,
  type GitLogPreferences
} from '../git/gitLogModels';
import type { SettingsSection } from './settingsMessages';

export interface SettingsAuthorityDependencies {
  readerStore: { get(): ReaderPreferences; save(value: ReaderPreferences): Promise<ReaderPreferences> };
  immersiveStore: { get(): ImmersiveReaderPreferences; save(value: ImmersiveReaderPreferences): Promise<ImmersiveReaderPreferences> };
  gitLogStore: { get(): GitLogPreferences; save(value: GitLogPreferences): Promise<GitLogPreferences> };
  onReaderSaved?(value: ReaderPreferences): void | PromiseLike<void>;
  onImmersiveSaved?(value: ImmersiveReaderPreferences): void | PromiseLike<void>;
  onGitLogSaved?(value: GitLogPreferences, previous: GitLogPreferences): void | PromiseLike<void>;
}

export interface AuthoritySnapshot {
  section: SettingsSection;
  reader: ReaderPreferences;
  immersive: ImmersiveReaderPreferences;
  gitLog: GitLogPreferences;
}

export class SettingsAuthority {
  constructor(private readonly dependencies: SettingsAuthorityDependencies) {}

  snapshot(section: SettingsSection): AuthoritySnapshot {
    return {
      section,
      reader: normalizeReaderPreferences(this.dependencies.readerStore.get()),
      immersive: normalizeImmersiveReaderPreferences(this.dependencies.immersiveStore.get()),
      gitLog: normalizeGitLogPreferences(this.dependencies.gitLogStore.get())
    };
  }

  async change(domain: 'reader' | 'immersive' | 'gitLog', key: string, value: unknown): Promise<unknown> {
    if (domain === 'reader') {
      const next = normalizeReaderPreferences({ ...this.dependencies.readerStore.get(), [key]: value });
      const saved = await this.dependencies.readerStore.save(next);
      await this.dependencies.onReaderSaved?.(saved);
      return saved[key as keyof ReaderPreferences];
    }
    if (domain === 'immersive') {
      const next = normalizeImmersiveReaderPreferences({ ...this.dependencies.immersiveStore.get(), [key]: value });
      const saved = await this.dependencies.immersiveStore.save(next);
      await this.dependencies.onImmersiveSaved?.(saved);
      return saved[key as keyof ImmersiveReaderPreferences];
    }
    const previous = normalizeGitLogPreferences(this.dependencies.gitLogStore.get());
    const next = normalizeGitLogPreferences({ ...previous, [key]: value });
    const saved = await this.dependencies.gitLogStore.save(next);
    await this.dependencies.onGitLogSaved?.(saved, previous);
    return saved[key as keyof GitLogPreferences];
  }

  async reset(section: 'reader' | 'immersive' | 'gitLog'): Promise<ReaderPreferences | ImmersiveReaderPreferences | GitLogPreferences> {
    if (section === 'reader') {
      const saved = await this.dependencies.readerStore.save(normalizeReaderPreferences(createDefaultReaderPreferences()));
      await this.dependencies.onReaderSaved?.(saved);
      return saved;
    }
    if (section === 'immersive') {
      const saved = await this.dependencies.immersiveStore.save(normalizeImmersiveReaderPreferences(createDefaultImmersiveReaderPreferences()));
      await this.dependencies.onImmersiveSaved?.(saved);
      return saved;
    }
    const previous = normalizeGitLogPreferences(this.dependencies.gitLogStore.get());
    const saved = await this.dependencies.gitLogStore.save(normalizeGitLogPreferences(createDefaultGitLogPreferences()));
    await this.dependencies.onGitLogSaved?.(saved, previous);
    return saved;
  }
}
