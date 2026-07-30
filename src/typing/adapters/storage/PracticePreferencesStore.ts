import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  type PracticePreferences
} from '../../domain/policies';
import {
  AtomicFileWriter,
  type AtomicFileWriterPort
} from './AtomicFileWriter';

export interface PracticePreferencesLoadResult {
  preferences: PracticePreferences;
  diagnostics: string[];
}

export interface PracticePreferencesStoreOptions {
  atomicWriter?: AtomicFileWriterPort;
}

export class PracticePreferencesStore {
  private readonly file: string;
  private readonly writer: AtomicFileWriterPort;

  constructor(
    typingStorageDirectory: string,
    options: PracticePreferencesStoreOptions = {}
  ) {
    this.file = path.join(
      path.resolve(typingStorageDirectory),
      'preferences',
      'practice.v1.json'
    );
    this.writer = options.atomicWriter ?? new AtomicFileWriter();
  }

  async load(): Promise<PracticePreferencesLoadResult> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if (isNotFound(error)) {
        return {
          preferences: structuredClone(DEFAULT_PRACTICE_PREFERENCES),
          diagnostics: []
        };
      }
      return {
        preferences: structuredClone(DEFAULT_PRACTICE_PREFERENCES),
        diagnostics: ['Practice preferences could not be parsed.']
      };
    }
    return normalizePreferences(value);
  }

  async save(preferences: PracticePreferences): Promise<void> {
    const normalized = normalizePreferences(preferences);
    if (normalized.diagnostics.length > 0) {
      throw new Error(normalized.diagnostics.join(' '));
    }
    await this.writer.write(
      this.file,
      `${JSON.stringify(normalized.preferences, undefined, 2)}\n`
    );
  }
}

function normalizePreferences(value: unknown): PracticePreferencesLoadResult {
  const diagnostics: string[] = [];
  const source = isRecord(value) ? value : {};
  if (source.schemaVersion !== 1) {
    diagnostics.push('Practice preferences schema is invalid.');
  }

  const evaluation = validEvaluation(source.evaluation)
    ? { errorPolicy: source.evaluation.errorPolicy }
    : (
      diagnostics.push('Practice preferences evaluation is invalid.'),
      structuredClone(DEFAULT_PRACTICE_PREFERENCES.evaluation)
    );
  const textPolicy = validTextPolicy(source.textPolicy)
    ? structuredClone(source.textPolicy)
    : (
      diagnostics.push('Practice preferences text policy is invalid.'),
      structuredClone(DEFAULT_PRACTICE_PREFERENCES.textPolicy)
    );
  const flowPolicy = validFlowPolicy(source.flowPolicy)
    ? structuredClone(source.flowPolicy)
    : (
      diagnostics.push('Practice preferences flow policy is invalid.'),
      structuredClone(DEFAULT_PRACTICE_PREFERENCES.flowPolicy)
    );
  const displayPolicy = validDisplayPolicy(source.displayPolicy)
    ? structuredClone(source.displayPolicy)
    : (
      diagnostics.push('Practice preferences display policy is invalid.'),
      structuredClone(DEFAULT_PRACTICE_PREFERENCES.displayPolicy)
    );
  let appearance = structuredClone(DEFAULT_PRACTICE_PREFERENCES.appearance);
  if (validAppearance(source.appearance)) {
    appearance = {
      fontSize: source.appearance.fontSize,
      lineHeight: source.appearance.lineHeight,
      fontFamily: source.appearance.fontFamily,
      showVirtualKeyboard: source.appearance.showVirtualKeyboard
    };
  } else if (source.appearance !== undefined) {
    diagnostics.push('Practice preferences appearance is invalid.');
  }

  return {
    preferences: {
      schemaVersion: 1,
      evaluation,
      textPolicy,
      flowPolicy,
      displayPolicy,
      appearance
    },
    diagnostics
  };
}

function validEvaluation(value: unknown): value is PracticePreferences['evaluation'] {
  return isRecord(value)
    && (value.errorPolicy === 'allowSkip' || value.errorPolicy === 'block');
}

function validTextPolicy(value: unknown): value is PracticePreferences['textPolicy'] {
  if (!isRecord(value) || typeof value.caseSensitive !== 'boolean') return false;
  if (!isRecord(value.punctuation) || typeof value.punctuation.mappingVersion !== 'string') {
    return false;
  }
  if (
    value.punctuation.mappingVersion.length === 0
    || (value.punctuation.mode !== 'strict' && value.punctuation.mode !== 'equivalent')
  ) {
    return false;
  }
  return isRecord(value.whitespace)
    && ['strict', 'collapse', 'trimLineEdges', 'ignore'].includes(
      String(value.whitespace.mode)
    );
}

function validFlowPolicy(value: unknown): value is PracticePreferences['flowPolicy'] {
  return isRecord(value)
    && (value.lineAdvance === 'automatic' || value.lineAdvance === 'enter')
    && (value.presentation === 'continuous' || value.presentation === 'lineFocus');
}

function validDisplayPolicy(value: unknown): value is PracticePreferences['displayPolicy'] {
  return isRecord(value)
    && typeof value.showLiveMetrics === 'boolean'
    && typeof value.showWhitespace === 'boolean';
}

function validAppearance(value: unknown): value is PracticePreferences['appearance'] {
  return isRecord(value)
    && typeof value.fontSize === 'number'
    && Number.isFinite(value.fontSize)
    && value.fontSize >= 18
    && value.fontSize <= 64
    && typeof value.lineHeight === 'number'
    && Number.isFinite(value.lineHeight)
    && value.lineHeight >= 1.2
    && value.lineHeight <= 2.4
    && (value.fontFamily === 'editor' || value.fontFamily === 'interface')
    && typeof value.showVirtualKeyboard === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
