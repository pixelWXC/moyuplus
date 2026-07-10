import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';

export function getReaderWebviewHtml(
  _webview: vscode.Webview,
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri
): string {
  const nonce = randomBytes(18).toString('base64url');
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    'img-src blob: data:',
    'font-src blob: data:',
    "connect-src 'none'",
    "frame-src 'none'",
    "media-src 'none'"
  ].join('; ');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>MoyuPlus Reader</title>
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri.toString()}">
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}
