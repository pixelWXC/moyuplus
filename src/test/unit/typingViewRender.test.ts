import { describe, expect, it } from 'vitest';
import type { TypingViewPageContent } from '../../typing/adapters/view';
import {
  renderTypingPageContent,
  renderTypingRecoveryBanner
} from '../../webview/typingViewRender';

describe('Typing View page rendering', () => {
  it('renders an explicit, accessible stale-checkpoint recovery choice', () => {
    const html = renderTypingRecoveryBanner({
      status: 'paused',
      savedAt: Date.UTC(2026, 6, 24, 12),
      completedUnits: 24,
      totalUnits: 100
    });

    expect(html).toContain('发现可恢复的练习');
    expect(html).toContain('24 / 100');
    expect(html).toContain('data-recovery-action="recover"');
    expect(html).toContain('data-recovery-action="dismiss"');
    expect(html).not.toContain('session-');
  });

  it('renders material actions and the user library', () => {
    const content: TypingViewPageContent = {
      kind: 'materials',
      library: [{
        id: 'mine-1',
        revision: 'v2',
        title: '工作摘录',
        origin: 'txtImport',
        profileKey: 'mixed.office',
        tags: ['办公'],
        counts: {
          graphemes: 48,
          hanGraphemes: 30,
          englishWords: 4,
          printableUnits: 44
        },
        estimatedSeconds: 25
      }],
      pendingRemovals: [{
        materialId: 'removed-1',
        title: '旧素材',
        deleteAfter: Date.now() + 10_000,
        waitingForPractice: false
      }],
      actions: {
        paste: true,
        importTxt: true,
        importEpub: true
      }
    };

    const html = renderTypingPageContent(content);

    expect(html).toContain('自由粘贴');
    expect(html).toContain('data-paste-form');
    expect(html).toContain('textarea');
    expect(html).toContain('开始设置');
    expect(html).toContain('导入 TXT');
    expect(html).toContain('导入 EPUB');
    expect(html).toContain('我的素材 <span class="section-count">1</span>');
    expect(html).not.toContain('内置素材');
    expect(html).toContain('data-material-id="mine-1"');
    expect(html).toContain('data-remove-material-id="mine-1"');
    expect(html).toContain('data-undo-material-id="removed-1"');
    expect(html).toContain('已移除“旧素材”');
    expect(html).toContain('TXT 导入');
  });

  it('escapes host-provided material text and teaches an empty library how to start', () => {
    const html = renderTypingPageContent({
      kind: 'materials',
      library: [{
        id: 'unsafe" onclick="alert(1)',
        revision: 'v1',
        title: '<script>alert(1)</script>',
        origin: 'custom',
        profileKey: 'english.article',
        tags: ['<b>tag</b>'],
        counts: {
          graphemes: 1,
          hanGraphemes: 0,
          englishWords: 1,
          printableUnits: 1
        },
        estimatedSeconds: 1
      }],
      actions: {
        paste: false,
        importTxt: false,
        importEpub: false
      }
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onclick=');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;tag&lt;/b&gt;');

    expect(renderTypingPageContent({
      kind: 'materials',
      library: [],
      actions: {
        paste: true,
        importTxt: true,
        importEpub: true
      }
    })).toContain('粘贴一段文字，或导入 TXT / EPUB');
  });

  it('renders the authoritative setup draft as a keyboard-accessible policy form', () => {
    const html = renderTypingPageContent({
      kind: 'setup',
      source: {
        title: '清晨练习',
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
          articleId: 'article-1'
        }
      }],
      selectedRange: {
        kind: 'article',
        articleId: 'article-1'
      },
      startPosition: {
        kind: 'continuation'
      },
      continuations: [{
        range: {
          kind: 'article',
          articleId: 'article-1'
        },
        sourceRevision: 'article-v1',
        targetIndex: 48,
        totalUnits: 120,
        updatedAt: 2_000
      }],
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
          presentation: 'lineFocus'
        },
        displayPolicy: {
          showLiveMetrics: false,
          showWhitespace: false
        }
      }
    });

    expect(html).toContain('data-setup-form');
    expect(html).toContain('清晨练习');
    expect(html).toContain('118 个可打印单元');
    expect(html).toContain('name="range"');
    expect(html).toContain('name="completionKind"');
    expect(html).toContain('name="startKind"');
    expect(html).toContain('value="continuation"');
    expect(html).toContain('第 48 个字符');
    expect(html).toContain('name="startPercent"');
    expect(html).toContain('value="timed" selected');
    expect(html).toContain('本次练习范围');
    expect(html).toContain('练完本次范围');
    expect(html).toContain('手动结束（自由练习）');
    expect(html).toContain('data-completion-setting="timed"');
    expect(html).toContain('data-completion-setting="length" hidden');
    expect(html).not.toContain('name="evaluationMode"');
    expect(html).toContain('name="showLiveMetrics"');
    expect(html).not.toContain('name="showLiveMetrics" checked');
    expect(html).toContain('保存并开始练习');
    expect(html).toContain('data-start-practice');
    expect(html).toContain('设为默认');
    expect(html).toContain('data-save-setup-defaults');
    expect(html).toContain('编辑练习字体与外观');
    expect(html).toContain('data-open-practice-editor-settings');
  });

  it('renders free practice without irrelevant time or unit controls', () => {
    const html = renderTypingPageContent({
      kind: 'setup',
      source: {
        title: '自由练习',
        profileKey: 'chinese.adHoc',
        counts: {
          graphemes: 20,
          hanGraphemes: 20,
          englishWords: 0,
          printableUnits: 20
        }
      },
      ranges: [{
        label: '全部内容',
        range: { kind: 'whole' }
      }],
      selectedRange: { kind: 'whole' },
      plan: {
        completion: { kind: 'free' },
        evaluation: { errorPolicy: 'block' },
        textPolicy: {
          punctuation: { mode: 'strict', mappingVersion: 'strict-v1' },
          whitespace: { mode: 'strict' },
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
    });

    expect(html).toContain('value="free" selected');
    expect(html).toContain('data-completion-source-range');
    expect(html).toContain('disabled hidden');
    expect(html).toContain('data-completion-setting="timed" hidden');
    expect(html).toContain('data-completion-setting="length" hidden');
  });

  it('renders all three explicit active-session conflict choices', () => {
    const html = renderTypingPageContent({
      kind: 'sessionConflict',
      page: 'setup',
      sessionId: 'session-current',
      status: 'paused'
    });

    expect(html).toContain('已有活动练习');
    expect(html).toContain('返回当前练习');
    expect(html).toContain('结束当前练习并新建');
    expect(html).toContain('取消');
    expect(html).toContain('data-conflict-resolution="returnCurrent"');
    expect(html).toContain('data-conflict-resolution="finishAndStart"');
    expect(html).toContain('data-conflict-resolution="cancel"');
  });

  it('renders live metrics and state-appropriate controls', () => {
    const html = renderTypingPageContent({
      kind: 'live',
      status: 'paused',
      progress: {
        completedUnits: 24,
        totalUnits: 100
      },
      metrics: {
        activeElapsedMs: 90_000,
        totalAttempts: 26,
        correctAttempts: 24,
        errorAttempts: 2,
        accuracy: 92.3,
        rawCpm: 17.3,
        effectiveCpm: 16
      },
      controls: {
        pause: false,
        resume: true,
        restart: true,
        finish: true
      }
    });

    expect(html).toContain('24 / 100');
    expect(html).toContain('92.3%');
    expect(html).toContain('01:30');
    expect(html).toContain('data-live-action="resume"');
    expect(html).not.toContain('data-live-action="pause"');
    expect(html).toContain('重新开始');
    expect(html).toContain('结束练习');
  });

  it('renders only progress, state and controls when live metrics are hidden', () => {
    const html = renderTypingPageContent({
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
    } as unknown as TypingViewPageContent);

    expect(html).toContain('练习中');
    expect(html).toContain('练习控制');
    expect(html).not.toContain('24 / 100');
    expect(html).not.toContain('准确率');
    expect(html).not.toContain('有效 CPM');
    expect(html).not.toContain('原始 CPM');
    expect(html).not.toContain('活动时间');
  });

  it('renders result facts, history summaries and mastery rankings with real empty states', () => {
    const recentHtml = renderTypingPageContent({
      kind: 'recent',
      items: [{
        resultId: 'result-1',
        materialId: '<unsafe>',
        sourceRevision: 'revision-1',
        profileKey: 'chinese.modernArticle',
        outcome: 'completed',
        endedAt: Date.UTC(2026, 6, 24, 12),
        activeElapsedMs: 60_000,
        accuracy: 95,
        effectiveCpm: 42
      }]
    });
    expect(recentHtml).toContain('最近练习');
    expect(recentHtml).toContain('42');
    expect(recentHtml).toContain('&lt;unsafe&gt;');
    expect(recentHtml).not.toContain('<unsafe>');
    expect(renderTypingPageContent({
      kind: 'recent',
      items: []
    })).toContain('还没有最近练习');

    const resultHtml = renderTypingPageContent({
      kind: 'result',
      result: {
        id: 'result-1',
        outcome: 'completed',
        endedAt: Date.UTC(2026, 6, 24, 12),
        activeElapsedMs: 60_000,
        metrics: {
          totalAttempts: 12,
          correctAttempts: 10,
          errorAttempts: 2,
          completedUnits: 10,
          accuracy: 83.3,
          rawCpm: 14.4,
          effectiveCpm: 12,
          longestCorrectStreak: 7,
          correctionCount: 1
        },
        speedBuckets: [{
          activeElapsedMs: 10_000,
          rawCpm: 18,
          effectiveCpm: 12,
          accuracy: 80
        }],
        errorPairs: [{ expected: '<的>', actual: '地', count: 2 }],
        errorWords: [{ word: '练习', count: 1 }]
      },
      benchmarkBest: {
        effectiveCpm: 15,
        accuracy: 90,
        isCurrentResult: false
      }
    });
    expect(resultHtml).toContain('83.3%');
    expect(resultHtml).toContain('有效 CPM');
    expect(resultHtml).toContain('&lt;的&gt;');
    expect(resultHtml).not.toContain('<的>');

    const historyHtml = renderTypingPageContent({
      kind: 'history',
      page: 1,
      pageSize: 50,
      totalItems: 1,
      items: [{
        resultId: 'result-1',
        outcome: 'completed',
        endedAt: Date.UTC(2026, 6, 24, 12),
        benchmarkKey: 'zh-article',
        metrics: {
          accuracy: 83.3,
          effectiveCpm: 12,
          rawCpm: 14.4,
          totalAttempts: 12,
          correctAttempts: 10,
          errorAttempts: 2
        }
      }],
      days: [{
        date: '2026-07-24',
        activeElapsedMs: 60_000,
        correctAttempts: 10,
        errorAttempts: 2,
        resultCount: 1
      }]
    });
    expect(historyHtml).toContain('2026-07-24');
    expect(historyHtml).toContain('第 1 页');
    expect(historyHtml).toContain('12');
    expect(historyHtml).toContain('data-clear-practice-history');
    expect(historyHtml).toContain('清理全部记录');

    const masteryHtml = renderTypingPageContent({
      kind: 'mastery',
      totalEntries: 1,
      entries: [{
        key: '<script>',
        kind: 'word',
        wrongCount: 4,
        reinforcementCorrectStreak: 1,
        lastErrorAt: Date.UTC(2026, 6, 24, 12),
        score: 3.5
      }]
    });
    expect(masteryHtml).toContain('&lt;script&gt;');
    expect(masteryHtml).not.toContain('<script>');
    expect(masteryHtml).toContain('错误 4 次');

    expect(renderTypingPageContent({
      kind: 'result',
      result: null,
      benchmarkBest: null
    })).toContain('还没有练习结果');
  });
});
