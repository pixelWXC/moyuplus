import { describe, expect, it } from 'vitest';
import { Uri, createWebviewView } from '../shims/vscode';
import { getReaderWebviewHtml } from '../../reader/webviewHtml';
import { getSettingsWebviewHtml } from '../../settings/MoyuPlusSettingsPanel';

describe('Reader webview security', () => {
  it('uses distinct nonces and the offline deny-by-default CSP', () => {
    const webview = createWebviewView().webview;
    const scriptUri = webview.asWebviewUri(Uri.file('/extension/media/readerApp.js'));
    const styleUri = webview.asWebviewUri(Uri.file('/extension/media/readerApp.css'));
    const first = getReaderWebviewHtml(webview as never, scriptUri as never, styleUri as never);
    const second = getReaderWebviewHtml(webview as never, scriptUri as never, styleUri as never);
    const firstNonce = first.match(/script-src 'nonce-([^']+)'/)?.[1];
    const secondNonce = second.match(/script-src 'nonce-([^']+)'/)?.[1];

    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
    expect(first).toContain("default-src 'none'");
    expect(first).toContain(`style-src 'nonce-${firstNonce}'`);
    expect(first).toContain("img-src blob: data:");
    expect(first).toContain("font-src blob: data:");
    expect(first).toContain("connect-src 'none'");
    expect(first).toContain("frame-src 'none'");
    expect(first).toContain("media-src 'none'");
    expect(first).toContain(`nonce="${firstNonce}" src="${scriptUri.toString()}"`);
    expect(first).toContain(`<link nonce="${firstNonce}" rel="stylesheet" href="${styleUri.toString()}">`);
  });
});

describe('settings Webview security', () => {
  it('uses fresh nonces and grants no image, font, network, frame or media capability', () => {
    const webview = createWebviewView().webview;
    const scriptUri = webview.asWebviewUri(Uri.file('/extension/media/settingsApp.js'));
    const styleUri = webview.asWebviewUri(Uri.file('/extension/media/settingsApp.css'));
    const first = getSettingsWebviewHtml(webview as never, scriptUri as never, styleUri as never);
    const second = getSettingsWebviewHtml(webview as never, scriptUri as never, styleUri as never);
    const nonce = first.match(/script-src 'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(second.match(/script-src 'nonce-([^']+)'/)?.[1]).not.toBe(nonce);
    expect(first).toContain("default-src 'none'");
    expect(first).toContain("connect-src 'none'");
    expect(first).toContain("frame-src 'none'");
    expect(first).toContain("media-src 'none'");
    expect(first).not.toContain('img-src');
    expect(first).not.toContain('font-src');
    expect(first).toContain(`nonce="${nonce}" src="${scriptUri.toString()}"`);
  });
});
