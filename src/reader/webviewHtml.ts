import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

export function getReaderWebviewHtml(webview: vscode.Webview): string {
  const nonce = randomBytes(16).toString('base64');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MoyuPlus Reader</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }

    select,
    button {
      min-height: 28px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      padding: 3px 8px;
      font: inherit;
    }

    select {
      min-width: 0;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border);
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .reader {
      box-sizing: border-box;
      min-height: 260px;
      height: calc(100vh - 128px);
      overflow: hidden;
      padding: 10px;
      border: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
      border-radius: 4px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .footer {
      display: grid;
      grid-template-columns: auto auto 1fr auto auto;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
    }

    .status {
      min-width: 0;
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty,
    .error {
      color: var(--vscode-descriptionForeground);
    }

    .error {
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <select id="fileSelect" aria-label="Select TXT file"></select>
    <button id="decreaseFont" title="Decrease font size">A-</button>
    <button id="increaseFont" title="Increase font size">A+</button>
  </div>
  <div class="meta">
    <span id="title">MoyuPlus Reader</span>
    <span id="source"></span>
  </div>
  <main id="reader" class="reader"></main>
  <div class="footer">
    <button id="previousPage">Previous</button>
    <button id="nextPage">Next</button>
    <span id="status" class="status"></span>
    <button id="refresh">Refresh</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const elements = {
      fileSelect: document.getElementById('fileSelect'),
      decreaseFont: document.getElementById('decreaseFont'),
      increaseFont: document.getElementById('increaseFont'),
      previousPage: document.getElementById('previousPage'),
      nextPage: document.getElementById('nextPage'),
      refresh: document.getElementById('refresh'),
      title: document.getElementById('title'),
      source: document.getElementById('source'),
      reader: document.getElementById('reader'),
      status: document.getElementById('status')
    };
    let payload = undefined;
    let currentRange = { startOffset: 0, endOffset: 0 };

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        payload = message.payload;
        render();
      } else if (message.type === 'error') {
        elements.status.textContent = message.message;
        elements.status.className = 'status error';
      }
    });

    elements.fileSelect.addEventListener('change', () => {
      if (elements.fileSelect.value) {
        vscode.postMessage({ type: 'selectFile', fileId: elements.fileSelect.value });
      }
    });

    elements.previousPage.addEventListener('click', () => {
      vscode.postMessage({ type: 'previousPage' });
    });

    elements.nextPage.addEventListener('click', () => {
      vscode.postMessage({
        type: 'nextPage',
        currentRange,
        viewportSnapshot: getViewportSnapshot()
      });
    });

    elements.decreaseFont.addEventListener('click', () => {
      const currentSize = payload?.session?.fontSize ?? 16;
      vscode.postMessage({ type: 'setFontSize', fontSize: currentSize - 1 });
    });

    elements.increaseFont.addEventListener('click', () => {
      const currentSize = payload?.session?.fontSize ?? 16;
      vscode.postMessage({ type: 'setFontSize', fontSize: currentSize + 1 });
    });

    elements.refresh.addEventListener('click', () => {
      vscode.postMessage({ type: 'ready' });
    });

    window.addEventListener('resize', () => {
      renderPage();
    });

    function render() {
      renderFileSelect();
      renderPage();
    }

    function renderFileSelect() {
      elements.fileSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = payload?.files?.length ? 'Select TXT' : 'No imported TXT files';
      elements.fileSelect.appendChild(placeholder);

      for (const file of payload?.files ?? []) {
        const option = document.createElement('option');
        option.value = file.id;
        option.textContent = file.name;
        option.selected = file.id === payload?.session?.fileId;
        elements.fileSelect.appendChild(option);
      }
    }

    function renderPage() {
      const text = payload?.text ?? '';
      const session = payload?.session ?? { offset: 0, fontSize: 16, lineHeight: 1.6, pageHistory: [] };
      elements.reader.style.fontSize = session.fontSize + 'px';
      elements.reader.style.lineHeight = session.lineHeight;

      elements.title.textContent = payload?.activeFile?.name ?? 'MoyuPlus Reader';
      elements.source.textContent = payload?.activeFile?.source ?? '';

      if (payload?.error) {
        elements.reader.className = 'reader error';
        elements.reader.textContent = payload.error;
        elements.status.textContent = payload.error;
        return;
      }

      if (!payload?.files?.length) {
        elements.reader.className = 'reader empty';
        elements.reader.textContent = 'No imported TXT files. Run "MoyuPlus: Import TXT" first.';
        elements.status.textContent = '';
        currentRange = { startOffset: 0, endOffset: 0 };
        return;
      }

      if (!payload?.activeFile) {
        elements.reader.className = 'reader empty';
        elements.reader.textContent = 'Select a TXT file to start reading.';
        elements.status.textContent = '';
        currentRange = { startOffset: 0, endOffset: 0 };
        return;
      }

      const startOffset = clamp(session.offset, 0, text.length);
      const pageSize = estimatePageSize(session.fontSize, session.lineHeight);
      const endOffset = findPageEnd(text, startOffset, pageSize);
      currentRange = { startOffset, endOffset };
      elements.reader.className = 'reader';
      elements.reader.textContent = text.slice(startOffset, endOffset);
      const percent = text.length ? Math.round((startOffset / text.length) * 100) : 0;
      elements.status.className = 'status';
      elements.status.textContent = percent + '% · ' + startOffset + '/' + text.length;
    }

    function estimatePageSize(fontSize, lineHeight) {
      const width = Math.max(elements.reader.clientWidth - 20, 160);
      const height = Math.max(elements.reader.clientHeight - 20, 180);
      const charsPerLine = Math.max(12, Math.floor(width / Math.max(fontSize * 0.56, 1)));
      const visibleLines = Math.max(6, Math.floor(height / Math.max(fontSize * lineHeight, 1)));
      return Math.max(1, charsPerLine * visibleLines);
    }

    function findPageEnd(text, startOffset, pageSize) {
      if (startOffset >= text.length) {
        return text.length;
      }
      const hardEnd = Math.min(text.length, startOffset + pageSize);
      if (hardEnd === text.length) {
        return hardEnd;
      }
      const newline = text.lastIndexOf('\\n', hardEnd);
      if (newline > startOffset + Math.floor(pageSize * 0.5)) {
        return newline + 1;
      }
      return hardEnd;
    }

    function getViewportSnapshot() {
      const session = payload?.session ?? { fontSize: 16, lineHeight: 1.6 };
      return {
        width: Math.max(elements.reader.clientWidth, 1),
        height: Math.max(elements.reader.clientHeight, 1),
        fontSize: session.fontSize,
        lineHeight: session.lineHeight
      };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
