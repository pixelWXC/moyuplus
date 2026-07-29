import { describe, expect, it } from 'vitest';
import {
  TYPING_SCHEMA_VERSION,
  createDefaultPracticePlan,
  type CompletionConstraint,
  type ContentProfile,
  type EvaluationPolicy,
  type MasteryEntry,
  type PracticeInputOrigin,
  type PracticePlan,
  type PracticeResult,
  type PracticeSessionState,
  type PracticeSnapshot
} from '../../typing';

describe('typing public contracts', () => {
  it('keeps the five plan axes orthogonal in the default Chinese article plan', () => {
    const plan = createDefaultPracticePlan({
      contentRecipe: { kind: 'custom', materialId: 'article-001' },
      contentProfile: { kind: 'chinese', category: 'modernArticle' }
    });

    expect(plan).toEqual({
      contentRecipe: { kind: 'custom', materialId: 'article-001' },
      completion: { kind: 'sourceRange', range: 'article' },
      evaluation: { errorPolicy: 'block' },
      textPolicy: {
        punctuation: { mode: 'equivalent', mappingVersion: 'zh-punctuation-v1' },
        whitespace: { mode: 'trimLineEdges' },
        caseSensitive: true
      },
      flowPolicy: { lineAdvance: 'automatic', presentation: 'continuous' },
      displayPolicy: { showLiveMetrics: true, showWhitespace: false }
    } satisfies PracticePlan);
  });

  it('uses strict text and Enter flow defaults for code without changing completion semantics', () => {
    const completion: CompletionConstraint = { kind: 'length', targetUnits: 100 };
    const plan = createDefaultPracticePlan({
      contentRecipe: { kind: 'generated', generator: 'code', seed: 'fixed', length: 100 },
      contentProfile: { kind: 'code', language: 'typescript' },
      completion
    });

    expect(plan.completion).toBe(completion);
    expect(plan.evaluation).toEqual({ errorPolicy: 'block' } satisfies EvaluationPolicy);
    expect(plan.textPolicy).toEqual({
      punctuation: { mode: 'strict', mappingVersion: 'strict-v1' },
      whitespace: { mode: 'strict' },
      caseSensitive: true
    });
    expect(plan.flowPolicy).toEqual({ lineAdvance: 'enter', presentation: 'continuous' });
  });

  it('exposes versioned snapshot, result, and mastery schemas without a vscode dependency', () => {
    const profile: ContentProfile = { kind: 'english', category: 'sentence' };
    const contracts: [
      PracticeSnapshot['schemaVersion'],
      PracticeResult['schemaVersion'],
      MasteryEntry['schemaVersion']
    ] = [TYPING_SCHEMA_VERSION, TYPING_SCHEMA_VERSION, TYPING_SCHEMA_VERSION];

    expect(profile).toEqual({ kind: 'english', category: 'sentence' });
    expect(contracts).toEqual([1, 1, 1]);
  });

  it('uses committed browser input origins and revisioned durable receipts', () => {
    const origins: PracticeInputOrigin[] = ['direct', 'composition', 'paste'];
    const sessionContract: Pick<
      PracticeSessionState,
      'revision' | 'transactionReceipts'
    > = {
      revision: 0,
      transactionReceipts: {}
    };

    expect(origins).toEqual(['direct', 'composition', 'paste']);
    expect(sessionContract).toEqual({
      revision: 0,
      transactionReceipts: {}
    });
  });
});
