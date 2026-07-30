import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  type PracticePreferences
} from '../../typing';
import { PracticePreferencesStore } from '../../typing/adapters/storage';

const temporaryRoots: string[] = [];

describe('PracticePreferencesStore', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(temporaryRoots.splice(0).map(root =>
      rm(root, { recursive: true, force: true })
    ));
  });

  it('normalizes invalid persisted values to defaults while retaining diagnostics', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'preferences'), { recursive: true });
    await writeFile(path.join(root, 'preferences', 'practice.v1.json'), JSON.stringify({
      schemaVersion: 1,
      evaluation: { mode: 'future-mode', errorPolicy: 'future-policy' },
      textPolicy: {
        punctuation: { mode: 'equivalent', mappingVersion: '' },
        whitespace: { mode: 'strict' },
        caseSensitive: 'yes'
      }
    }), 'utf8');
    const store = new PracticePreferencesStore(root);

    const loaded = await store.load();

    expect(loaded.preferences).toEqual(DEFAULT_PRACTICE_PREFERENCES);
    expect(loaded.diagnostics).toContain('Practice preferences evaluation is invalid.');
    expect(loaded.diagnostics).toContain('Practice preferences text policy is invalid.');
  });

  it('atomically persists a valid normalized preference snapshot', async () => {
    const root = await temporaryRoot();
    const store = new PracticePreferencesStore(root);
    const preferences: PracticePreferences = {
      ...structuredClone(DEFAULT_PRACTICE_PREFERENCES),
      evaluation: { errorPolicy: 'allowSkip' },
      displayPolicy: { showLiveMetrics: false, showWhitespace: true }
    };

    await store.save(preferences);

    await expect(store.load()).resolves.toEqual({
      preferences,
      diagnostics: []
    });
  });

  it('reads a v1 evaluation mode but only writes the new evaluation contract', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'preferences'), { recursive: true });
    await writeFile(path.join(root, 'preferences', 'practice.v1.json'), JSON.stringify({
      schemaVersion: 1,
      evaluation: { mode: 'committedBatch', errorPolicy: 'allowSkip' },
      textPolicy: DEFAULT_PRACTICE_PREFERENCES.textPolicy,
      flowPolicy: DEFAULT_PRACTICE_PREFERENCES.flowPolicy,
      displayPolicy: DEFAULT_PRACTICE_PREFERENCES.displayPolicy,
      appearance: {
        ...DEFAULT_PRACTICE_PREFERENCES.appearance,
        colorKeyboardHands: false
      }
    }), 'utf8');
    const store = new PracticePreferencesStore(root);

    const loaded = await store.load();
    await store.save(loaded.preferences);
    const persisted = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        path.join(root, 'preferences', 'practice.v1.json'),
        'utf8'
      )
    ) as Record<string, unknown>;

    expect(loaded.preferences.evaluation).toEqual({ errorPolicy: 'allowSkip' });
    expect(loaded.preferences.appearance).toEqual(
      DEFAULT_PRACTICE_PREFERENCES.appearance
    );
    expect(persisted.evaluation).toEqual({ errorPolicy: 'allowSkip' });
    expect(persisted.appearance).toEqual(DEFAULT_PRACTICE_PREFERENCES.appearance);
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-preferences-'));
  temporaryRoots.push(root);
  return root;
}
