import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';

export interface TypingPracticePanelAppearance {
  fontSize: number;
  lineHeight: number;
  fontFamily: 'editor' | 'interface';
  showVirtualKeyboard: boolean;
  colorKeyboardHands: boolean;
}

export function createTypingPracticePanelHtml(input: {
  webview: vscode.Webview;
  sessionId: string;
  scriptUri: vscode.Uri;
  styleUri: vscode.Uri;
  appearance?: TypingPracticePanelAppearance;
}): string {
  const nonce = randomBytes(18).toString('base64url');
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'none'",
    "frame-src 'none'",
    "media-src 'none'",
    `img-src ${input.webview.cspSource} data:`
  ].join('; ');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>打字练习</title>
  <link nonce="${nonce}" rel="stylesheet" href="${input.styleUri.toString()}">
</head>
<body
  data-session-id="${escapeAttribute(input.sessionId)}"
  data-practice-font-size="${input.appearance?.fontSize ?? 34}"
  data-practice-line-height="${input.appearance?.lineHeight ?? 1.6}"
  data-practice-font-family="${input.appearance?.fontFamily ?? 'editor'}"
  data-show-virtual-keyboard="${input.appearance?.showVirtualKeyboard ?? true}"
  data-color-keyboard-hands="${input.appearance?.colorKeyboardHands ?? true}"
>
  <div id="app"></div>
  <script nonce="${nonce}" src="${input.scriptUri.toString()}"></script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
