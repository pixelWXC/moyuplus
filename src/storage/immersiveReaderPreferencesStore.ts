import {
  normalizeImmersiveReaderPreferences,
  type ImmersiveReaderPreferences
} from '../domain/immersiveReaderPreferences';
import type { StateMemento } from './memento';
import { IMMERSIVE_READER_PREFERENCES_KEY } from './storageKeys';

export class ImmersiveReaderPreferencesStore {
  constructor(private readonly state: StateMemento) {}

  get(): ImmersiveReaderPreferences {
    return normalizeImmersiveReaderPreferences(this.state.get<unknown>(IMMERSIVE_READER_PREFERENCES_KEY));
  }

  async save(value: ImmersiveReaderPreferences): Promise<ImmersiveReaderPreferences> {
    const normalized = normalizeImmersiveReaderPreferences(value);
    await this.state.update(IMMERSIVE_READER_PREFERENCES_KEY, normalized);
    return normalized;
  }
}
