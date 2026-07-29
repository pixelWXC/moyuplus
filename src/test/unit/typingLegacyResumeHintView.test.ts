import { describe, expect, it, vi } from 'vitest';
import {
  TYPING_VIEW_PROTOCOL_VERSION,
  TYPING_VIEW_PAGES,
  TypingViewApplicationQuery,
  TypingViewProvider,
  isHostToTypingViewMessage,
  isTypingViewToHostMessage
} from '../../typing/adapters/view';
import { renderTypingLegacyResumeHintBanner } from '../../webview/typingViewRender';
import { createWebviewView, Uri } from '../shims/vscode';

const hint = {
  sourceTitle: '旧练习.txt',
  sourceAvailable: true,
  physicalLineNumber: 8,
  whitespace: {
    skipEmptyLines: true,
    trimLeadingSpaces: true,
    trimTrailingSpaces: false,
    ignoreAllSpaces: false
  }
} as const;

describe('legacy resume hint in Typing View', () => {
  it('projects only the safe confirmation summary into the shell', async () => {
    const query = new TypingViewApplicationQuery({
      catalog: { list: async () => [] },
      legacyResumeHint: () => hint
    });

    await expect(query.shellSnapshot('materials')).resolves.toEqual(
      expect.objectContaining({
        legacyResumeHint: hint
      })
    );
  });

  it('accepts strict confirm/dismiss requests with no source identifiers', () => {
    for (const type of [
      'resumeLegacyPractice',
      'dismissLegacyResumeHint'
    ] as const) {
      expect(isTypingViewToHostMessage({
        protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
        instanceId: 'typing-view-1',
        type,
        requestId: `${type}-1`,
        clientRevision: 1
      })).toBe(true);
      expect(isTypingViewToHostMessage({
        protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
        instanceId: 'typing-view-1',
        type,
        requestId: `${type}-2`,
        clientRevision: 2,
        bookId: 'must-not-cross-webview'
      })).toBe(false);
    }
  });

  it('validates the safe host snapshot and rejects hidden identifiers', () => {
    const base = {
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'shellSnapshot',
      snapshotRevision: 1,
      snapshot: {
        activePage: 'materials',
        availablePages: ['materials'],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: null,
        legacyResumeHint: hint,
        content: {
          kind: 'materials',
          library: [],
          actions: { paste: true, importTxt: true, importEpub: true }
        }
      }
    } as const;

    expect(isHostToTypingViewMessage(base)).toBe(true);
    expect(isHostToTypingViewMessage({
      ...base,
      snapshot: {
        ...base.snapshot,
        legacyResumeHint: {
          ...hint,
          bookId: 'hidden'
        }
      }
    })).toBe(false);
  });

  it('renders an explicit user confirmation instead of an automatic restore', () => {
    const html = renderTypingLegacyResumeHintBanner(hint);

    expect(html).toContain('旧版练习设置');
    expect(html).toContain('第 8 行附近');
    expect(html).toContain('迁移到新版设置');
    expect(html).toContain('忽略旧练习');
    expect(html).toContain('data-legacy-resume-action="resume"');
    expect(html).not.toContain('bookId');
  });

  it('routes confirmation through the injected host port and opens setup', async () => {
    const query = {
      shellSnapshot: vi.fn(async (activePage: 'materials' | 'setup') => ({
        activePage,
        availablePages: [...TYPING_VIEW_PAGES],
        activeSessionStatus: null,
        pendingResultCount: 0,
        recovery: null,
        content: activePage === 'materials'
          ? {
            kind: 'materials' as const,
            library: [],
            actions: { paste: true, importTxt: true, importEpub: true }
          }
          : { kind: 'unavailable' as const, page: 'setup' as const }
      }))
    };
    const resumeLegacyPractice = vi.fn(async () => true);
    const provider = new TypingViewProvider(
      Uri.file('/extension'),
      query,
      { resumeLegacyPractice } as never
    );
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'resumeLegacyPractice',
      requestId: 'resume-1',
      clientRevision: 1
    });

    expect(resumeLegacyPractice).toHaveBeenCalledOnce();
    expect(query.shellSnapshot).toHaveBeenLastCalledWith('setup');
  });
});
