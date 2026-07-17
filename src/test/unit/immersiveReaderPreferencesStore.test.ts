import { describe, expect, it } from 'vitest';
import { createDefaultImmersiveReaderPreferences } from '../../domain/immersiveReaderPreferences';
import { ImmersiveReaderPreferencesStore } from '../../storage/immersiveReaderPreferencesStore';

describe('ImmersiveReaderPreferencesStore', () => {
  it('persists a model independent from ReaderPreferences and normalizes writes', async () => {
    const values = new Map<string, unknown>();
    const store = new ImmersiveReaderPreferencesStore({
      get: key => values.get(key),
      update: async (key, value) => { values.set(key, value); }
    });
    expect(store.get()).toEqual(createDefaultImmersiveReaderPreferences());
    expect(await store.save({
      ...createDefaultImmersiveReaderPreferences(), visualLines: 99, italic: true
    })).toEqual({
      ...createDefaultImmersiveReaderPreferences(), visualLines: 12, italic: true
    });
  });
});
