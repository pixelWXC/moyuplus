import { normalizeGitLogPreferences, type GitLogPreferences } from '../git/gitLogModels';
import type { StateMemento } from './memento';
import { GIT_LOG_PREFERENCES_KEY } from './storageKeys';

export class GitLogPreferencesStore {
  constructor(private readonly state: StateMemento) {}

  get(): GitLogPreferences {
    return normalizeGitLogPreferences(this.state.get<unknown>(GIT_LOG_PREFERENCES_KEY));
  }

  async save(value: GitLogPreferences): Promise<GitLogPreferences> {
    const normalized = normalizeGitLogPreferences(value);
    await this.state.update(GIT_LOG_PREFERENCES_KEY, normalized);
    return normalized;
  }
}
