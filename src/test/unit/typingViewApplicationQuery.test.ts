import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  PracticeSetupDraft,
  type PracticeMaterialRecord
} from '../../typing';
import {
  TypingViewApplicationQuery,
  type TypingViewMaterialCatalogPort
} from '../../typing/adapters/view';

const customMaterial: PracticeMaterialRecord = {
  schemaVersion: 1,
  id: 'custom-1',
  revision: 'custom-v1',
  title: '我的素材',
  origin: 'custom',
  contentProfile: { kind: 'mixed', category: 'office' },
  tags: ['自定义'],
  source: { kind: 'managed', bodyRevision: 'custom-v1' },
  counts: {
    graphemes: 12,
    hanGraphemes: 8,
    englishWords: 2,
    printableUnits: 11
  },
  estimatedSeconds: 18,
  createdAt: 100,
  updatedAt: 200
};

describe('TypingViewApplicationQuery', () => {
  it('projects a stale workspace checkpoint as a host-owned recovery prompt', async () => {
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      recoverablePractice: async () => ({
        status: 'paused',
        savedAt: 2_000,
        completedUnits: 4,
        totalUnits: 10
      })
    });

    await expect(query.shellSnapshot('materials')).resolves.toEqual(
      expect.objectContaining({
        recovery: {
          status: 'paused',
          savedAt: 2_000,
          completedUnits: 4,
          totalUnits: 10
        }
      })
    );
  });

  it('projects managed materials without exposing store mutation', async () => {
    const catalog: TypingViewMaterialCatalogPort = {
      list: async () => [structuredClone(customMaterial)]
    };
    const query = new TypingViewApplicationQuery({
      catalog,
      activeSessionStatus: async () => 'paused',
      pendingResultCount: async () => 2
    });

    await expect(query.shellSnapshot('materials')).resolves.toEqual({
      activePage: 'materials',
      availablePages: [
        'materials',
        'recent',
        'setup',
        'live',
        'result',
        'history',
        'mastery'
      ],
      activeSessionStatus: 'paused',
      pendingResultCount: 2,
      recovery: null,
      content: {
        kind: 'materials',
        library: [{
          id: 'custom-1',
          revision: 'custom-v1',
          title: '我的素材',
          origin: 'custom',
          profileKey: 'mixed.office',
          tags: ['自定义'],
          counts: {
            graphemes: 12,
            hanGraphemes: 8,
            englishWords: 2,
            printableUnits: 11
          },
          estimatedSeconds: 18
        }],
        actions: {
          paste: true,
          importTxt: true,
          importEpub: true
        }
      }
    });
    expect('upsert' in catalog).toBe(false);
  });

  it('returns an explicit placeholder for pages whose query slice is not loaded yet', async () => {
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] }
    });

    await expect(query.shellSnapshot('setup')).resolves.toEqual(expect.objectContaining({
      activePage: 'setup',
      content: {
        kind: 'unavailable',
        page: 'setup'
      }
    }));
  });

  it('projects the selected setup draft through content inspection and preference defaults', async () => {
    const draft = new PracticeSetupDraft();
    draft.selectContent({
      kind: 'custom',
      materialId: 'material-1'
    });
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      setupDraft: draft,
      inspectContent: async recipe => {
        expect(recipe).toEqual({
          kind: 'custom',
          materialId: 'material-1'
        });
        return {
          title: '清晨',
          sourceRevision: 'entry-v1',
          contentProfile: { kind: 'chinese', category: 'modernArticle' },
          counts: {
            graphemes: 120,
            hanGraphemes: 110,
            englishWords: 0,
            printableUnits: 118
          },
          ranges: [{
            kind: 'article',
            articleId: 'material-1'
          }]
        };
      },
      practicePreferences: async () => ({
        ...structuredClone(DEFAULT_PRACTICE_PREFERENCES),
        evaluation: {
          errorPolicy: 'allowSkip'
        },
        displayPolicy: {
          showLiveMetrics: false,
          showWhitespace: false
        }
      })
    });

    await expect(query.shellSnapshot('setup')).resolves.toEqual(
      expect.objectContaining({
        activePage: 'setup',
        content: {
          kind: 'setup',
          source: {
            title: '清晨',
            profileKey: 'chinese.modernArticle',
            counts: {
              graphemes: 120,
              hanGraphemes: 110,
              englishWords: 0,
              printableUnits: 118
            }
          },
          ranges: [{
            label: '全文',
            range: {
              kind: 'article',
              articleId: 'material-1'
            }
          }],
          selectedRange: {
            kind: 'article',
            articleId: 'material-1'
          },
          plan: {
            completion: {
              kind: 'sourceRange',
              range: 'article'
            },
            evaluation: {
              errorPolicy: 'allowSkip'
            },
            textPolicy: DEFAULT_PRACTICE_PREFERENCES.textPolicy,
            flowPolicy: DEFAULT_PRACTICE_PREFERENCES.flowPolicy,
            displayPolicy: {
              showLiveMetrics: false,
              showWhitespace: false
            }
          }
        }
      })
    );
  });

  it('projects a pending active-session conflict instead of silently replacing setup', async () => {
    const draft = new PracticeSetupDraft();
    draft.selectContent({
      kind: 'custom',
      materialId: 'material-1'
    });
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      setupDraft: draft,
      sessionConflict: () => ({
        sessionId: 'session-current',
        status: 'running'
      })
    });

    await expect(query.shellSnapshot('setup')).resolves.toEqual(
      expect.objectContaining({
        activePage: 'setup',
        activeSessionStatus: null,
        content: {
          kind: 'sessionConflict',
          page: 'setup',
          sessionId: 'session-current',
          status: 'running'
        }
      })
    );
  });

  it('keeps live metrics in the practice panel until the result is committed', async () => {
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      activePractice: async () => ({
        monotonicNow: 61_000,
        session: {
          id: 'session-current',
          snapshotId: 'snapshot-current',
          status: 'running',
          targetIndex: 2,
          startedAtMonotonic: 1_000,
          accumulatedPausedMs: 0,
          inputAttempts: [{
            expected: '你',
            actual: '你',
            correct: true
          }, {
            expected: '好',
            actual: '号',
            correct: false
          }, {
            expected: '好',
            actual: '好',
            correct: true
          }]
        } as never,
        snapshot: {
          id: 'snapshot-current',
          plan: {
            displayPolicy: {
              showLiveMetrics: true
            }
          },
          targetUnits: Array.from({ length: 10 }, (_, index) => ({
            index,
            value: '字'
          }))
        } as never
      })
    });

    await expect(query.shellSnapshot('live')).resolves.toEqual(
      expect.objectContaining({
        activePage: 'live',
        content: {
          kind: 'live',
          status: 'running',
          progress: null,
          metrics: null,
          controls: {
            pause: true,
            resume: false,
            restart: true,
            finish: true
          }
        }
      })
    );
  });

  it('does not project live metrics when the active plan hides them', async () => {
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      activePractice: async () => ({
        monotonicNow: 61_000,
        session: {
          id: 'session-hidden-metrics',
          snapshotId: 'snapshot-hidden-metrics',
          status: 'running',
          targetIndex: 2,
          startedAtMonotonic: 1_000,
          accumulatedPausedMs: 0,
          inputAttempts: [{
            expected: '你',
            actual: '你',
            correct: true
          }]
        } as never,
        snapshot: {
          id: 'snapshot-hidden-metrics',
          plan: {
            displayPolicy: {
              showLiveMetrics: false
            }
          },
          targetUnits: Array.from({ length: 10 }, (_, index) => ({
            index,
            value: '字'
          }))
        } as never
      })
    });

    await expect(query.shellSnapshot('live')).resolves.toEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          kind: 'live',
          progress: null,
          metrics: null
        })
      })
    );
  });

  it('projects result, paged history, daily totals and mastery from read-only fact ports', async () => {
    const endedAt = Date.UTC(2026, 6, 24, 12);
    const result = {
      schemaVersion: 1,
      id: 'result-latest',
      sessionId: 'session-latest',
      attemptId: 'attempt-latest',
      snapshotId: 'snapshot-latest',
      materialId: 'material-1',
      sourceRevision: 'entry-v1',
      outcome: 'completed',
      contentProfile: { kind: 'chinese', category: 'modernArticle' },
      completion: { kind: 'free' },
      evaluation: { errorPolicy: 'block' },
      textPolicy: DEFAULT_PRACTICE_PREFERENCES.textPolicy,
      startedAt: endedAt - 60_000,
      endedAt,
      wallElapsedMs: 60_000,
      activeElapsedMs: 50_000,
      metrics: {
        totalAttempts: 12,
        correctAttempts: 10,
        errorAttempts: 2,
        completedUnits: 10,
        printableAttempts: 12,
        completedPrintableUnits: 10,
        completedHanzi: 10,
        completedEnglishCharacters: 0,
        completedEnglishWords: 0,
        accuracy: 83.333,
        rawCpm: 14.4,
        effectiveCpm: 12,
        hanziPerMinute: 12,
        standardWpm: 0,
        completeWordsPerMinute: 0,
        longestCorrectStreak: 7,
        correctionCounts: {
          backspace: 1,
          delete: 0,
          undo: 0,
          redo: 0,
          selectionDelete: 0,
          other: 0
        }
      },
      speedBuckets: [{
        wallStartedAt: endedAt - 10_000,
        activeElapsedMs: 10_000,
        rawCpm: 18,
        effectiveCpm: 12,
        accuracy: 80,
        correctAttempts: 2,
        errorAttempts: 1,
        backspaces: 1,
        otherCorrections: 0
      }],
      errorPairs: [{ expected: '的', actual: '地', count: 2 }],
      errorWords: [{ word: '练习', count: 1 }],
      masteryObservations: [],
      benchmarkKey: 'zh-article'
    } as const;
    const historyItems = Array.from({ length: 51 }, (_, index) => ({
      resultId: `history-${index}`,
      outcome: 'completed' as const,
      endedAt: endedAt - index,
      benchmarkKey: 'zh-article',
      metrics: structuredClone(result.metrics)
    }));
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      results: { list: async () => [structuredClone(result)] },
      history: {
        read: async () => ({
          schemaVersion: 1,
          sourceResultIds: historyItems.map(item => item.resultId),
          items: historyItems,
          bestByBenchmark: [{
            benchmarkKey: 'zh-article',
            resultId: 'result-best',
            effectiveCpm: 15,
            accuracy: 90
          }]
        })
      },
      daily: {
        read: async () => ({
          schemaVersion: 1,
          sourceResultIds: ['result-latest'],
          days: [{
            date: '2026-07-24',
            activeElapsedMs: 50_000,
            correctAttempts: 10,
            errorAttempts: 2,
            backspaces: 1,
            otherCorrections: 0,
            resultIds: ['result-latest']
          }]
        })
      },
      mastery: {
        read: async () => ({
          schemaVersion: 1,
          sourceResultIds: ['result-latest'],
          entries: [{
            schemaVersion: 1,
            key: '的',
            kind: 'grapheme',
            contentProfile: { kind: 'chinese', category: 'modernArticle' },
            wrongCount: 4,
            reinforcementCorrectStreak: 1,
            lastErrorAt: endedAt,
            lastPracticedAt: endedAt,
            score: 3.5,
            algorithmVersion: 'mastery-v1'
          }]
        })
      }
    } as never);

    await expect(query.shellSnapshot('result')).resolves.toEqual(expect.objectContaining({
      content: {
        kind: 'result',
        result: expect.objectContaining({
          id: 'result-latest',
          outcome: 'completed',
          activeElapsedMs: 50_000,
          metrics: expect.objectContaining({
            accuracy: 83.333,
            effectiveCpm: 12
          }),
          speedBuckets: [expect.objectContaining({
            effectiveCpm: 12,
            accuracy: 80
          })],
          errorPairs: [{ expected: '的', actual: '地', count: 2 }],
          errorWords: [{ word: '练习', count: 1 }]
        }),
        benchmarkBest: {
          effectiveCpm: 15,
          accuracy: 90,
          isCurrentResult: false
        }
      }
    }));
    await expect(query.shellSnapshot('recent')).resolves.toEqual(expect.objectContaining({
      content: {
        kind: 'recent',
        items: [{
          resultId: 'result-latest',
          materialId: 'material-1',
          sourceRevision: 'entry-v1',
          profileKey: 'chinese.modernArticle',
          outcome: 'completed',
          endedAt,
          activeElapsedMs: 50_000,
          accuracy: 83.333,
          effectiveCpm: 12
        }]
      }
    }));
    const history = await query.shellSnapshot('history');
    expect(history.content).toEqual({
      kind: 'history',
      page: 1,
      pageSize: 50,
      totalItems: 51,
      items: expect.arrayContaining([
        expect.objectContaining({ resultId: 'history-0' }),
        expect.objectContaining({ resultId: 'history-49' })
      ]),
      days: [expect.objectContaining({
        date: '2026-07-24',
        resultCount: 1
      })]
    });
    expect(history.content.kind === 'history' && history.content.items).toHaveLength(50);
    await expect(query.shellSnapshot('mastery')).resolves.toEqual(expect.objectContaining({
      content: {
        kind: 'mastery',
        totalEntries: 1,
        entries: [{
          key: '的',
          kind: 'grapheme',
          wrongCount: 4,
          reinforcementCorrectStreak: 1,
          lastErrorAt: endedAt,
          score: 3.5
        }]
      }
    }));
  });

  it('returns explicit empty facts when no result, history or mastery exists', async () => {
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      results: { list: async () => [] },
      history: {
        read: async () => ({
          schemaVersion: 1,
          sourceResultIds: [],
          items: [],
          bestByBenchmark: []
        })
      },
      daily: {
        read: async () => ({
          schemaVersion: 1,
          sourceResultIds: [],
          days: []
        })
      },
      mastery: {
        read: async () => ({
          schemaVersion: 1,
          sourceResultIds: [],
          entries: []
        })
      }
    } as never);

    await expect(query.shellSnapshot('result')).resolves.toEqual(expect.objectContaining({
      content: {
        kind: 'result',
        result: null,
        benchmarkBest: null
      }
    }));
    await expect(query.shellSnapshot('recent')).resolves.toEqual(expect.objectContaining({
      content: {
        kind: 'recent',
        items: []
      }
    }));
    await expect(query.shellSnapshot('history')).resolves.toEqual(expect.objectContaining({
      content: {
        kind: 'history',
        page: 1,
        pageSize: 50,
        totalItems: 0,
        items: [],
        days: []
      }
    }));
    await expect(query.shellSnapshot('mastery')).resolves.toEqual(expect.objectContaining({
      content: {
        kind: 'mastery',
        totalEntries: 0,
        entries: []
      }
    }));
  });
});
