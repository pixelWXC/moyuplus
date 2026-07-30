import { describe, expect, it } from 'vitest';
import {
  TYPING_VIEW_ID,
  TYPING_VIEW_PROTOCOL_VERSION,
  TYPING_VIEW_PAGES,
  TYPING_VIEW_PRIMARY_PAGES,
  isHostToTypingViewMessage,
  isTypingViewToHostMessage
} from '../../typing/adapters/view';

const envelope = {
  protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
  instanceId: 'typing-view-1'
} as const;
const appearance = {
  fontSize: 34,
  lineHeight: 1.6,
  fontFamily: 'editor',
  showVirtualKeyboard: true
} as const;

describe('Typing View protocol', () => {
  it('owns a distinct view id, protocol version and complete page set', () => {
    expect(TYPING_VIEW_ID).toBe('moyuplus.typingView');
    expect(TYPING_VIEW_PROTOCOL_VERSION).toBe(16);
    expect(TYPING_VIEW_PAGES).toEqual([
      'materials',
      'recent',
      'live',
      'result',
      'history',
      'mastery',
      'setup'
    ]);
    expect(TYPING_VIEW_PRIMARY_PAGES).toEqual([
      'materials',
      'recent',
      'live',
      'result',
      'history',
      'mastery'
    ]);
  });

  it('accepts bootstrap messages only for the current strict envelope', () => {
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'typingReady'
    })).toBe(true);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'retrySnapshot'
    })).toBe(true);

    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'typingReady',
      unexpected: true
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      protocolVersion: 999,
      type: 'typingReady'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      instanceId: '../shared',
      type: 'typingReady'
    })).toBe(false);
  });

  it('accepts revisioned page navigation and rejects stale-shaped requests', () => {
    for (const page of TYPING_VIEW_PAGES) {
      expect(isTypingViewToHostMessage({
        ...envelope,
        type: 'navigate',
        requestId: `navigate-${page}`,
        clientRevision: 1,
        page
      })).toBe(true);
    }

    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'navigate',
      requestId: 'navigate-bad',
      clientRevision: 0,
      page: 'materials'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'navigate',
      requestId: 'navigate-bad',
      clientRevision: 1,
      page: 'settings'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'navigate',
      requestId: 'navigate-bad',
      clientRevision: 1,
      page: 'materials',
      materialId: 'not-allowed-on-navigation'
    })).toBe(false);
  });

  it('accepts only strict revisioned material commands', () => {
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'selectMaterial',
      requestId: 'select-custom',
      clientRevision: 1,
      materialId: 'custom-1',
      materialOrigin: 'custom'
    })).toBe(true);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'usePastedText',
      requestId: 'paste-1',
      clientRevision: 2,
      text: '第一行\n第二行'
    })).toBe(true);
    for (const format of ['txt', 'epub']) {
      expect(isTypingViewToHostMessage({
        ...envelope,
        type: 'importMaterial',
        requestId: `import-${format}`,
        clientRevision: 3,
        format
      })).toBe(true);
    }
    for (const type of ['removeMaterial', 'undoRemoveMaterial']) {
      expect(isTypingViewToHostMessage({
        ...envelope,
        type,
        requestId: `${type}-1`,
        clientRevision: 4,
        materialId: 'custom-1'
      })).toBe(true);
    }

    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'selectMaterial',
      requestId: 'unsafe',
      clientRevision: 1,
      materialId: '../catalog',
      materialOrigin: 'custom'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'selectMaterial',
      requestId: 'removed-origin',
      clientRevision: 1,
      materialId: 'legacy-entry',
      materialOrigin: 'builtIn'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'usePastedText',
      requestId: 'empty',
      clientRevision: 2,
      text: '   \n'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'importMaterial',
      requestId: 'bad-format',
      clientRevision: 3,
      format: 'pdf'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'importMaterial',
      requestId: 'extra',
      clientRevision: 4,
      format: 'txt',
      sourceUri: 'file:///secret.txt'
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'removeMaterial',
      requestId: 'unsafe-remove',
      clientRevision: 5,
      materialId: '../materials'
    })).toBe(false);
  });

  it('accepts a strict setup update and rejects incomplete policy payloads', () => {
    const message = {
      ...envelope,
      type: 'configureSetup',
      requestId: 'configure-1',
      clientRevision: 4,
      selectedRange: {
        kind: 'chapter',
        chapterId: 'chapter-1'
      },
      plan: {
        completion: {
          kind: 'timed',
          seconds: 180
        },
        evaluation: {
          errorPolicy: 'block'
        },
        textPolicy: {
          punctuation: {
            mode: 'equivalent',
            mappingVersion: 'zh-punctuation-v1'
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
    } as const;

    expect(isTypingViewToHostMessage(message)).toBe(true);
    expect(isTypingViewToHostMessage({
      ...message,
      plan: {
        ...message.plan,
        evaluation: {}
      }
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...message,
      selectedRange: {
        kind: 'selection',
        start: 10,
        end: 4
      }
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...message,
      type: 'saveSetupAsDefault',
      requestId: 'save-defaults-1',
      clientRevision: 5,
      appearance
    })).toBe(true);
    expect(isTypingViewToHostMessage({
      ...message,
      type: 'saveSetupAsDefault',
      requestId: 'save-defaults-extra',
      clientRevision: 6,
      appearance,
      editorFontSize: 18
    })).toBe(false);
  });

  it('rejects the removed VS Code practice settings bridge', () => {
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'openPracticeEditorSettings',
      requestId: 'open-language-settings',
      clientRevision: 7
    })).toBe(false);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'openPracticeEditorSettings',
      requestId: 'unsafe-language-settings',
      clientRevision: 8,
      languageId: 'typescript'
    })).toBe(false);
  });

  it('accepts only an explicit revisioned history-clear request', () => {
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'clearPracticeHistory',
      requestId: 'clear-history-1',
      clientRevision: 9
    })).toBe(true);
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'clearPracticeHistory',
      requestId: 'clear-history-unsafe',
      clientRevision: 10,
      resultId: 'client-selected'
    })).toBe(false);
  });

  it('accepts only argument-free mastery start and adjustment requests', () => {
    for (const [type, revision] of [
      ['startMasteryPractice', 11],
      ['adjustMasteryPractice', 12]
    ] as const) {
      expect(isTypingViewToHostMessage({
        ...envelope,
        type,
        requestId: `${type}-1`,
        clientRevision: revision
      })).toBe(true);
      expect(isTypingViewToHostMessage({
        ...envelope,
        type,
        requestId: `${type}-unsafe`,
        clientRevision: revision + 10,
        batchSize: 200
      })).toBe(false);
    }
  });

  it('accepts explicit start and conflict decisions without trusting a client session id', () => {
    const start = {
      ...envelope,
      type: 'startPractice',
      requestId: 'start-1',
      clientRevision: 5,
      selectedRange: {
        kind: 'whole'
      },
      startPosition: {
        kind: 'percentage',
        percent: 50
      },
      plan: {
        completion: { kind: 'free' },
        evaluation: {
          errorPolicy: 'block'
        },
        textPolicy: {
          punctuation: {
            mode: 'strict',
            mappingVersion: 'strict-v1'
          },
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
      },
      appearance
    } as const;
    expect(isTypingViewToHostMessage(start)).toBe(true);
    expect(isTypingViewToHostMessage({
      ...start,
      startPosition: {
        kind: 'percentage',
        percent: 100
      }
    })).toBe(false);
    for (const resolution of ['returnCurrent', 'finishAndStart', 'cancel']) {
      expect(isTypingViewToHostMessage({
        ...envelope,
        type: 'resolveSessionConflict',
        requestId: `resolve-${resolution}`,
        clientRevision: 6,
        resolution
      })).toBe(true);
    }
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'resolveSessionConflict',
      requestId: 'unsafe-session',
      clientRevision: 6,
      resolution: 'finishAndStart',
      sessionId: 'client-chosen-session'
    })).toBe(false);
  });

  it('validates an authoritative setup conflict snapshot', () => {
    const message = {
      ...envelope,
      type: 'shellSnapshot',
      snapshotRevision: 3,
      snapshot: {
        activePage: 'setup',
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus: 'paused',
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'sessionConflict',
          page: 'setup',
          sessionId: 'session-current',
          status: 'paused'
        }
      }
    } as const;

    expect(isHostToTypingViewMessage(message)).toBe(true);
    expect(isHostToTypingViewMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        content: {
          ...message.snapshot.content,
          sessionId: '../unsafe'
        }
      }
    })).toBe(false);
  });

  it('accepts strict live controls and a live fact snapshot', () => {
    for (const action of ['pause', 'resume', 'restart', 'finish']) {
      expect(isTypingViewToHostMessage({
        ...envelope,
        type: 'controlPractice',
        requestId: `control-${action}`,
        clientRevision: 7,
        action
      })).toBe(true);
    }
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'controlPractice',
      requestId: 'unsafe-control',
      clientRevision: 7,
      action: 'finish',
      sessionId: 'client-selected'
    })).toBe(false);

    expect(isHostToTypingViewMessage({
      ...envelope,
      type: 'shellSnapshot',
      snapshotRevision: 4,
      snapshot: {
        activePage: 'live',
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus: 'running',
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'live',
          status: 'running',
          progress: {
            completedUnits: 24,
            totalUnits: 100
          },
          metrics: {
            activeElapsedMs: 60_000,
            totalAttempts: 25,
            correctAttempts: 24,
            errorAttempts: 1,
            accuracy: 96,
            rawCpm: 25,
            effectiveCpm: 24
          },
          controls: {
            pause: true,
            resume: false,
            restart: true,
            finish: true
          }
        }
      }
    })).toBe(true);
  });

  it('accepts a live snapshot that withholds metrics by policy', () => {
    expect(isHostToTypingViewMessage({
      ...envelope,
      type: 'shellSnapshot',
      snapshotRevision: 5,
      snapshot: {
        activePage: 'live',
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus: 'running',
        pendingResultCount: 0,
        recovery: null,
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
      }
    })).toBe(true);
  });

  it('accepts recovery decisions without trusting a Webview session id', () => {
    for (const type of ['recoverPractice', 'dismissRecovery']) {
      expect(isTypingViewToHostMessage({
        ...envelope,
        type,
        requestId: type,
        clientRevision: 8
      })).toBe(true);
    }
    expect(isTypingViewToHostMessage({
      ...envelope,
      type: 'recoverPractice',
      requestId: 'unsafe-recovery',
      clientRevision: 8,
      sessionId: 'client-selected'
    })).toBe(false);

    expect(isHostToTypingViewMessage({
      ...envelope,
      type: 'shellSnapshot',
      snapshotRevision: 6,
      snapshot: {
        activePage: 'materials',
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: {
          status: 'running',
          savedAt: 2_000,
          completedUnits: 12,
          totalUnits: 100
        },
        content: {
          kind: 'materials',
          library: [],
          pendingRemovals: [{
            materialId: 'custom-1',
            title: '待删除素材',
            deleteAfter: 10_000,
            waitingForPractice: false
          }],
          actions: {
            paste: true,
            importTxt: true,
            importEpub: true
          }
        }
      }
    })).toBe(true);
  });

  it('accepts only strict result, history and mastery fact snapshots', () => {
    const base = {
      ...envelope,
      type: 'shellSnapshot' as const,
      snapshotRevision: 5,
      snapshot: {
        activePage: 'result' as const,
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus: 'completed' as const,
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'result' as const,
          result: null,
          benchmarkBest: null
        }
      }
    };
    expect(isHostToTypingViewMessage(base)).toBe(true);
    expect(isHostToTypingViewMessage({
      ...base,
      snapshot: {
        ...base.snapshot,
        content: {
          ...base.snapshot.content,
          leakedPath: 'D:/private/result.json'
        }
      }
    })).toBe(false);

    expect(isHostToTypingViewMessage({
      ...base,
      snapshot: {
        ...base.snapshot,
        activePage: 'history',
        content: {
          kind: 'history',
          page: 1,
          pageSize: 50,
          totalItems: 0,
          items: [],
          days: []
        }
      }
    })).toBe(true);
    expect(isHostToTypingViewMessage({
      ...base,
      snapshot: {
        ...base.snapshot,
        activePage: 'mastery',
        content: {
          kind: 'mastery',
          totalEntries: 1,
          entries: [{
            key: '的',
            kind: 'grapheme',
            wrongCount: -1,
            reinforcementCorrectStreak: 0,
            lastErrorAt: Date.now(),
            score: 1
          }]
        }
      }
    })).toBe(false);
  });

  it('validates shell snapshots before the Webview consumes them', () => {
    const message = {
      ...envelope,
      type: 'shellSnapshot',
      snapshotRevision: 1,
      snapshot: {
        activePage: 'materials',
        availablePages: [...TYPING_VIEW_PRIMARY_PAGES],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'materials',
          library: [],
          notice: '请先选择有效的练习素材，再设置本次练习。',
          actions: {
            paste: true,
            importTxt: true,
            importEpub: true
          }
        }
      }
    };

    expect(isHostToTypingViewMessage(message)).toBe(true);
    expect(isHostToTypingViewMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        content: {
          ...message.snapshot.content,
          builtIn: []
        }
      }
    })).toBe(false);
    expect(isHostToTypingViewMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        activeSessionStatus: 'unknown'
      }
    })).toBe(false);
    expect(isHostToTypingViewMessage({
      ...message,
      snapshotRevision: 0
    })).toBe(false);
    expect(isHostToTypingViewMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        availablePages: ['materials', 'settings']
      }
    })).toBe(false);
    expect(isHostToTypingViewMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        content: {
          kind: 'unavailable',
          page: 'history'
        }
      }
    })).toBe(false);
  });

  it('validates setup content without exposing the selected recipe body', () => {
    const message = {
      ...envelope,
      type: 'shellSnapshot',
      snapshotRevision: 2,
      snapshot: {
        activePage: 'setup',
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: null,
        content: {
          kind: 'setup',
          source: {
            title: '自由练习',
            profileKey: 'mixed.adHoc',
            counts: {
              graphemes: 12,
              hanGraphemes: 4,
              englishWords: 2,
              printableUnits: 11
            }
          },
          ranges: [{
            label: '全部内容',
            range: { kind: 'whole' }
          }],
          selectedRange: { kind: 'whole' },
          plan: {
            completion: { kind: 'free' },
            evaluation: {
              errorPolicy: 'block'
            },
            textPolicy: {
              punctuation: {
                mode: 'strict',
                mappingVersion: 'strict-v1'
              },
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
          },
          appearance
        }
      }
    } as const;

    expect(isHostToTypingViewMessage(message)).toBe(true);
    expect(JSON.stringify(message)).not.toContain('secret pasted text');
    expect(isHostToTypingViewMessage({
      ...message,
      snapshot: {
        ...message.snapshot,
        content: {
          ...message.snapshot.content,
          selectedRange: {
            kind: 'chapter',
            chapterId: '../unsafe'
          }
        }
      }
    })).toBe(false);
  });
});
