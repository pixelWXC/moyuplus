import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';

export function getTypingViewHtml(
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri
): string {
  const nonce = randomBytes(18).toString('base64url');
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'none'",
    "font-src 'none'",
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
  <title>MoyuPlus Typing</title>
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri.toString()}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}
