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

  it('provides a shortcut settings entry in the reader webview', () => {
    const html = getReaderWebviewHtml({ cspSource: 'vscode-resource:' } as never);

    expect(html).toContain('id="shortcutSettings"');
    expect(html).toContain("type: 'openShortcutSettings'");
  });
});
