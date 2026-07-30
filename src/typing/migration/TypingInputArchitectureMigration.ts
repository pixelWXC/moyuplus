import {
  TYPING_SCHEMA_VERSION,
  type PracticePlan,
  type PracticeSnapshot
} from '../domain/content';
import type {
  DisplayPolicy,
  ErrorPolicy,
  FlowPolicy,
  PracticePreferences,
  TextPolicy
} from '../domain/policies';
import { DEFAULT_PRACTICE_PREFERENCES } from '../domain/policies';
import type {
  InputAttempt,
  PracticeCheckpoint,
  PracticeSessionState
} from '../domain/session';

export function migratePracticePreferences(value: unknown): PracticePreferences {
  const source = requireRecord(value, 'Practice preferences');
  return {
    schemaVersion: 1,
    evaluation: migrateEvaluation(source.evaluation),
    textPolicy: cloneRequired<TextPolicy>(source.textPolicy, 'text policy'),
    flowPolicy: cloneRequired<FlowPolicy>(source.flowPolicy, 'flow policy'),
    displayPolicy: cloneRequired<DisplayPolicy>(source.displayPolicy, 'display policy'),
    appearance: structuredClone(DEFAULT_PRACTICE_PREFERENCES.appearance)
  };
}

export function migratePracticeSnapshot(value: unknown): PracticeSnapshot {
  const source = requireRecord(value, 'Practice snapshot');
  const plan = requireRecord(source.plan, 'Practice plan');
  return {
    ...structuredClone(source),
    schemaVersion: TYPING_SCHEMA_VERSION,
    plan: migratePlan(plan)
  } as unknown as PracticeSnapshot;
}

export function migratePracticeCheckpoint(value: unknown): PracticeCheckpoint {
  const source = requireRecord(value, 'Practice checkpoint');
  return {
    ...structuredClone(source),
    schemaVersion: TYPING_SCHEMA_VERSION,
    session: migratePracticeSession(source.session)
  } as unknown as PracticeCheckpoint;
}

export function migratePracticeSession(value: unknown): PracticeSessionState {
  const source = requireRecord(value, 'Practice session');
  const attempts = Array.isArray(source.inputAttempts)
    ? source.inputAttempts.map(migrateInputAttempt)
    : [];
  const revision = nonNegativeInteger(source.revision) ? source.revision : 0;
  const receipts = isRecord(source.transactionReceipts)
    ? structuredClone(source.transactionReceipts)
    : {};
  return {
    ...structuredClone(source),
    schemaVersion: TYPING_SCHEMA_VERSION,
    revision,
    transactionReceipts: receipts,
    inputAttempts: attempts
  } as unknown as PracticeSessionState;
}

function migratePlan(source: Record<string, unknown>): PracticePlan {
  return {
    ...structuredClone(source),
    evaluation: migrateEvaluation(source.evaluation)
  } as unknown as PracticePlan;
}

function migrateEvaluation(value: unknown): { errorPolicy: ErrorPolicy } {
  const source = requireRecord(value, 'Practice evaluation');
  if (source.errorPolicy !== 'allowSkip' && source.errorPolicy !== 'block') {
    throw new Error('Practice evaluation error policy is invalid.');
  }
  return { errorPolicy: source.errorPolicy };
}

function migrateInputAttempt(value: unknown): InputAttempt {
  const source = requireRecord(value, 'Practice input attempt');
  const origin = source.origin === 'committedBatch'
    ? 'composition'
    : source.origin === 'character' || source.origin === 'enter' || source.origin === 'tab'
      ? 'direct'
      : source.origin;
  if (origin !== 'direct' && origin !== 'composition' && origin !== 'paste') {
    throw new Error('Practice input attempt origin is invalid.');
  }
  return {
    ...structuredClone(source),
    origin
  } as unknown as InputAttempt;
}

function cloneRequired<T>(value: unknown, label: string): T {
  if (!isRecord(value)) {
    throw new Error(`Practice ${label} is invalid.`);
  }
  return structuredClone(value) as T;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
