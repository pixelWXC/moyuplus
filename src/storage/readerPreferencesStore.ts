import {
  normalizeReaderPreferences,
  type ReaderPreferences
} from '../domain/readerPreferences';
import type { StateMemento } from './memento';
import { READER_PREFERENCES_KEY } from './storageKeys';

export class ReaderPreferencesStore {
  constructor(private readonly state: StateMemento) {}

  get(): ReaderPreferences {
    return normalizeReaderPreferences(this.state.get<unknown>(READER_PREFERENCES_KEY));
  }

  async save(preferences: ReaderPreferences): Promise<ReaderPreferences> {
    const normalized = normalizeReaderPreferences(preferences);
    await this.state.update(READER_PREFERENCES_KEY, normalized);
    return normalized;
  }
}
