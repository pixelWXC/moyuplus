import { describe, expect, it } from 'vitest';
import type { TypingViewSetupContent } from '../../typing/adapters/view';
import { createTypingSetupConfiguration } from '../../webview/typingSetupForm';

const setupContent: TypingViewSetupContent = {
  kind: 'setup',
  source: {
    title: '章节练习',
    profileKey: 'chinese.fiction',
    counts: {
      graphemes: 200,
      hanGraphemes: 180,
      englishWords: 0,
      printableUnits: 190
    }
  },
  ranges: [
    {
      label: '第一章',
      range: {
        kind: 'chapter',
        chapterId: 'chapter-1'
      }
    },
    {
      label: '第二章',
      range: {
        kind: 'chapter',
        chapterId: 'chapter-2'
      }
    }
  ],
  selectedRange: {
    kind: 'chapter',
    chapterId: 'chapter-1'
  },
  plan: {
    completion: {
      kind: 'sourceRange',
      range: 'chapter'
    },
    evaluation: {
      errorPolicy: 'block'
    },
    textPolicy: {
      punctuation: {
        mode: 'strict',
        mappingVersion: 'strict-v1'
      },
      whitespace: {
        mode: 'trimLineEdges'
      },
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
  }
};

describe('Typing setup form', () => {
  it('converts form values into a strict current-practice configuration', () => {
    expect(createTypingSetupConfiguration(setupContent, {
      range: '1',
      completionKind: 'timed',
      completionSeconds: '180',
      completionUnits: '100',
      errorPolicy: 'allowSkip',
      punctuationMode: 'equivalent',
      whitespaceMode: 'ignore',
      caseSensitive: false,
      lineAdvance: 'enter',
      presentation: 'lineFocus',
      showLiveMetrics: false,
      showWhitespace: true
    })).toEqual({
      selectedRange: {
        kind: 'chapter',
        chapterId: 'chapter-2'
      },
      startPosition: {
        kind: 'beginning'
      },
      plan: {
        completion: {
          kind: 'timed',
          seconds: 180
        },
        evaluation: {
          errorPolicy: 'allowSkip'
        },
        textPolicy: {
          punctuation: {
            mode: 'equivalent',
            mappingVersion: 'zh-punctuation-v1'
          },
          whitespace: {
            mode: 'ignore'
          },
          caseSensitive: false
        },
        flowPolicy: {
          lineAdvance: 'enter',
          presentation: 'lineFocus'
        },
        displayPolicy: {
          showLiveMetrics: false,
          showWhitespace: true
        }
      }
    });
  });

  it('rejects an unknown range and maps whole-content source completion to free mode', () => {
    expect(createTypingSetupConfiguration(setupContent, {
      range: '99',
      completionKind: 'free'
    })).toBeUndefined();

    expect(createTypingSetupConfiguration({
      ...setupContent,
      ranges: [{
        label: '全部内容',
        range: { kind: 'whole' }
      }],
      selectedRange: { kind: 'whole' }
    }, {
      range: '0',
      completionKind: 'sourceRange'
    })?.plan.completion).toEqual({
      kind: 'free'
    });
  });

  it('selects an available continuation or an explicit percentage start', () => {
    const resumable: TypingViewSetupContent = {
      ...setupContent,
      continuations: [{
        range: {
          kind: 'chapter',
          chapterId: 'chapter-2'
        },
        sourceRevision: 'chapter-v1',
        targetIndex: 80,
        totalUnits: 200,
        updatedAt: 2_000
      }]
    };

    expect(createTypingSetupConfiguration(resumable, {
      range: '1',
      startKind: 'continuation'
    })?.startPosition).toEqual({
      kind: 'continuation'
    });
    expect(createTypingSetupConfiguration(resumable, {
      range: '0',
      startKind: 'percentage',
      startPercent: '63'
    })?.startPosition).toEqual({
      kind: 'percentage',
      percent: 63
    });
  });
});
