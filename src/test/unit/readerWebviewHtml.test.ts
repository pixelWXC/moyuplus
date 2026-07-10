import { describe, expect, it } from 'vitest';
import { getReaderWebviewHtml } from '../../reader/webviewHtml';

describe('reader webview html', () => {
  it('uses DOM measurement instead of fixed character estimates for pagination', () => {
    const html = getReaderWebviewHtml({ cspSource: 'vscode-resource:' } as never);

    expect(html).toContain('id="measure"');
    expect(html).toContain('findMeasuredPageEnd');
    expect(html).toContain('ResizeObserver');
    expect(html).toContain("type: 'pageRendered'");
    expect(html).not.toContain('estimatePageSize');
    expect(html).not.toContain('charsPerLine');
  });

  it('provides an in-plugin shortcut settings page with status, risk, and edit actions', () => {
    const html = getReaderWebviewHtml({ cspSource: 'vscode-resource:' } as never);

    expect(html).toContain('id="shortcutSettings"');
    expect(html).toContain('id="shortcutPanel"');
    expect(html).toContain('renderShortcutSettings');
    expect(html).toContain("type: 'setShortcutEnabled'");
    expect(html).toContain("type: 'openShortcutEditor'");
    expect(html).toContain('潜在冲突');
  });

  it('offers recovery actions for empty, missing, and decode-error reader states', () => {
    const html = getReaderWebviewHtml({ cspSource: 'vscode-resource:' } as never);

    expect(html).toContain("type: 'importTxt'");
    expect(html).toContain("type: 'removeActiveFile'");
    expect(html).toContain("type: 'switchActiveFileEncoding'");
  });

  it('keeps keyboard focus and live status visible in the narrow VS Code sidebar', () => {
    const html = getReaderWebviewHtml({ cspSource: 'vscode-resource:' } as never);

    expect(html).toContain(':focus-visible');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('@media (max-width: 320px)');
  });
});
