import type {
  TypingViewSetupContent,
  TypingViewSetupPlan,
  TypingViewSourceRange
} from '../typing/adapters/view/typingViewProtocol';

export interface TypingSetupFormValues {
  range?: string;
  completionKind?: string;
  completionSeconds?: string;
  completionUnits?: string;
  errorPolicy?: string;
  punctuationMode?: string;
  whitespaceMode?: string;
  caseSensitive?: boolean;
  lineAdvance?: string;
  presentation?: string;
  showLiveMetrics?: boolean;
  showWhitespace?: boolean;
}

export interface TypingSetupConfiguration {
  selectedRange: TypingViewSourceRange;
  plan: TypingViewSetupPlan;
}

export function createTypingSetupConfiguration(
  content: TypingViewSetupContent,
  values: TypingSetupFormValues
): TypingSetupConfiguration | undefined {
  const rangeIndex = Number(values.range);
  if (!Number.isSafeInteger(rangeIndex) || rangeIndex < 0) return undefined;
  const selectedRange = content.ranges[rangeIndex]?.range;
  if (!selectedRange) return undefined;
  const completionKind = values.completionKind ?? content.plan.completion.kind;
  const punctuationMode = values.punctuationMode === 'equivalent'
    ? 'equivalent'
    : values.punctuationMode === 'strict'
      ? 'strict'
      : content.plan.textPolicy.punctuation.mode;

  return {
    selectedRange: structuredClone(selectedRange),
    plan: {
      completion: completionFor(
        completionKind,
        selectedRange,
        values,
        content.plan.completion
      ),
      evaluation: {
        errorPolicy: values.errorPolicy === 'allowSkip'
          ? 'allowSkip'
          : values.errorPolicy === 'block'
            ? 'block'
            : content.plan.evaluation.errorPolicy
      },
      textPolicy: {
        punctuation: {
          mode: punctuationMode,
          mappingVersion: punctuationMode === 'equivalent'
            ? 'zh-punctuation-v1'
            : 'strict-v1'
        },
        whitespace: {
          mode: whitespaceMode(
            values.whitespaceMode,
            content.plan.textPolicy.whitespace.mode
          )
        },
        caseSensitive: values.caseSensitive
          ?? content.plan.textPolicy.caseSensitive
      },
      flowPolicy: {
        lineAdvance: values.lineAdvance === 'enter'
          ? 'enter'
          : values.lineAdvance === 'automatic'
            ? 'automatic'
            : content.plan.flowPolicy.lineAdvance,
        presentation: values.presentation === 'lineFocus'
          ? 'lineFocus'
          : values.presentation === 'continuous'
            ? 'continuous'
            : content.plan.flowPolicy.presentation
      },
      displayPolicy: {
        showLiveMetrics: values.showLiveMetrics
          ?? content.plan.displayPolicy.showLiveMetrics,
        showWhitespace: values.showWhitespace
          ?? content.plan.displayPolicy.showWhitespace
      }
    }
  };
}

function completionFor(
  kind: string,
  range: TypingViewSourceRange,
  values: TypingSetupFormValues,
  fallback: TypingViewSetupPlan['completion']
): TypingViewSetupPlan['completion'] {
  if (kind === 'timed') {
    return {
      kind,
      seconds: positiveInteger(
        values.completionSeconds,
        fallback.kind === 'timed' ? fallback.seconds : 180
      )
    };
  }
  if (kind === 'length') {
    return {
      kind,
      targetUnits: positiveInteger(
        values.completionUnits,
        fallback.kind === 'length' ? fallback.targetUnits : 100
      )
    };
  }
  if (kind === 'sourceRange') {
    if (range.kind === 'article') {
      return { kind, range: 'article' };
    }
    if (range.kind === 'chapter') {
      return { kind, range: 'chapter' };
    }
    if (range.kind === 'selection') {
      return { kind, range: 'selection' };
    }
  }
  return { kind: 'free' };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function whitespaceMode(
  value: string | undefined,
  fallback: TypingViewSetupPlan['textPolicy']['whitespace']['mode']
): TypingViewSetupPlan['textPolicy']['whitespace']['mode'] {
  return value === 'strict'
    || value === 'collapse'
    || value === 'ignore'
    || value === 'trimLineEdges'
    ? value
    : fallback;
}
