export type ErrorPolicy = 'allowSkip' | 'block';

export interface EvaluationPolicy {
  errorPolicy: ErrorPolicy;
}

export type PunctuationPolicy =
  | { mode: 'strict'; mappingVersion: string }
  | { mode: 'equivalent'; mappingVersion: string };

export type WhitespacePolicy =
  | { mode: 'strict' }
  | { mode: 'collapse' }
  | { mode: 'trimLineEdges' }
  | { mode: 'ignore' };

export interface TextPolicy {
  punctuation: PunctuationPolicy;
  whitespace: WhitespacePolicy;
  caseSensitive: boolean;
}

export interface FlowPolicy {
  lineAdvance: 'automatic' | 'enter';
  presentation: 'continuous' | 'lineFocus';
}

export interface DisplayPolicy {
  showLiveMetrics: boolean;
  showWhitespace: boolean;
}

export interface PracticePreferences {
  schemaVersion: 1;
  evaluation: EvaluationPolicy;
  textPolicy: TextPolicy;
  flowPolicy: FlowPolicy;
  displayPolicy: DisplayPolicy;
}

export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = deepFreeze({
  schemaVersion: 1,
  evaluation: {
    errorPolicy: 'block'
  },
  textPolicy: {
    punctuation: { mode: 'strict', mappingVersion: 'strict-v1' },
    whitespace: { mode: 'trimLineEdges' },
    caseSensitive: true
  },
  flowPolicy: {
    lineAdvance: 'automatic',
    presentation: 'continuous'
  },
  displayPolicy: {
    showLiveMetrics: true,
    showWhitespace: false
  }
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
