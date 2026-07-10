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

    button {
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    }

    button:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
    }

    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    button.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    button:active {
      transform: translateY(1px);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
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

    .measure {
      position: absolute;
      top: 0;
      left: -10000px;
      box-sizing: border-box;
      height: auto;
      min-height: 0;
      max-height: none;
      overflow: visible;
      visibility: hidden;
      pointer-events: none;
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

    [hidden] {
      display: none !important;
    }

    .recovery-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .shortcut-panel {
      height: calc(100vh - 24px);
      overflow: auto;
    }

    .shortcut-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .shortcut-list {
      display: grid;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .shortcut-item {
      padding: 10px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .shortcut-item-title,
    .shortcut-item-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .shortcut-item-meta {
      flex-wrap: wrap;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .shortcut-item-meta > .shortcut-description {
      margin-right: auto;
    }

    .shortcut-description,
    .shortcut-risk,
    .shortcut-note {
      margin-top: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.4;
    }

    .shortcut-risk {
      color: var(--vscode-editorWarning-foreground);
    }

    kbd {
      padding: 2px 6px;
      border: 1px solid var(--vscode-keybindingLabel-border, var(--vscode-panel-border));
      border-radius: 3px;
      background: var(--vscode-keybindingLabel-background);
      color: var(--vscode-keybindingLabel-foreground);
      font-family: var(--vscode-editor-font-family);
    }

    @media (max-width: 320px) {
      body {
        padding: 8px;
      }

      .toolbar {
        gap: 4px;
      }

      .footer {
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      .footer .status {
        grid-column: 1 / -1;
        grid-row: 1;
      }

      .shortcut-item-title {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <section id="readerPanel">
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
  <div id="recoveryActions" class="recovery-actions" hidden>
    <button id="importTxt" class="primary">导入 TXT</button>
    <button id="removeActiveFile">移除导入记录</button>
    <button id="switchActiveFileEncoding">切换 UTF-8 / GBK</button>
  </div>
  <div id="measure" class="measure" aria-hidden="true"></div>
  <div class="footer">
    <button id="previousPage">Previous</button>
    <button id="nextPage" class="primary">Next</button>
    <span id="status" class="status" role="status" aria-live="polite"></span>
    <button id="shortcutSettings">Shortcuts</button>
    <button id="refresh">Refresh</button>
  </div>
  </section>
  <section id="shortcutPanel" class="shortcut-panel" hidden>
    <div class="shortcut-header">
      <strong>快捷键设置</strong>
      <button id="closeShortcutSettings">返回阅读器</button>
    </div>
    <p class="shortcut-note">这里显示 MoyuPlus 默认绑定和启用状态。用户自定义后的实际绑定请在 VS Code Keyboard Shortcuts 中查看。</p>
    <div id="shortcutList" class="shortcut-list"></div>
    <div class="recovery-actions">
      <button id="openAdvancedSettings">打开高级设置</button>
    </div>
  </section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const elements = {
      fileSelect: document.getElementById('fileSelect'),
      decreaseFont: document.getElementById('decreaseFont'),
      increaseFont: document.getElementById('increaseFont'),
      previousPage: document.getElementById('previousPage'),
      nextPage: document.getElementById('nextPage'),
      shortcutSettings: document.getElementById('shortcutSettings'),
      readerPanel: document.getElementById('readerPanel'),
      shortcutPanel: document.getElementById('shortcutPanel'),
      shortcutList: document.getElementById('shortcutList'),
      closeShortcutSettings: document.getElementById('closeShortcutSettings'),
      openAdvancedSettings: document.getElementById('openAdvancedSettings'),
      recoveryActions: document.getElementById('recoveryActions'),
      importTxt: document.getElementById('importTxt'),
      removeActiveFile: document.getElementById('removeActiveFile'),
      switchActiveFileEncoding: document.getElementById('switchActiveFileEncoding'),
      refresh: document.getElementById('refresh'),
      title: document.getElementById('title'),
      source: document.getElementById('source'),
      reader: document.getElementById('reader'),
      measure: document.getElementById('measure'),
      status: document.getElementById('status')
    };
    let payload = undefined;
    let currentRange = { startOffset: 0, endOffset: 0 };
    let lastRenderedSignature = undefined;
    let renderFrame = 0;

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        payload = message.payload;
        render();
      } else if (message.type === 'error') {
        elements.status.textContent = message.message;
        elements.status.className = 'status error';
      } else if (message.type === 'command' && message.command === 'nextPage') {
        postNextPage();
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
      postNextPage();
    });

    elements.shortcutSettings.addEventListener('click', () => {
      elements.readerPanel.hidden = true;
      elements.shortcutPanel.hidden = false;
      renderShortcutSettings();
      elements.closeShortcutSettings.focus();
    });

    elements.closeShortcutSettings.addEventListener('click', () => {
      elements.shortcutPanel.hidden = true;
      elements.readerPanel.hidden = false;
      elements.shortcutSettings.focus();
    });

    elements.openAdvancedSettings.addEventListener('click', () => {
      vscode.postMessage({ type: 'openShortcutSettings' });
    });

    elements.importTxt.addEventListener('click', () => {
      vscode.postMessage({ type: 'importTxt' });
    });

    elements.removeActiveFile.addEventListener('click', () => {
      vscode.postMessage({ type: 'removeActiveFile' });
    });

    elements.switchActiveFileEncoding.addEventListener('click', () => {
      vscode.postMessage({ type: 'switchActiveFileEncoding' });
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

    function postNextPage() {
      vscode.postMessage({
        type: 'nextPage',
        currentRange,
        viewportSnapshot: getViewportSnapshot()
      });
    }

    window.addEventListener('resize', scheduleRenderPage);

    if (typeof ResizeObserver === 'function') {
      const readerResizeObserver = new ResizeObserver(() => {
        scheduleRenderPage();
      });
      readerResizeObserver.observe(elements.reader);
    }

    function render() {
      renderFileSelect();
      renderPage();
      renderShortcutSettings();
    }

    function renderShortcutSettings() {
      elements.shortcutList.innerHTML = '';
      for (const item of payload?.shortcuts ?? []) {
        const container = document.createElement('div');
        container.className = 'shortcut-item';

        const title = document.createElement('div');
        title.className = 'shortcut-item-title';
        const label = document.createElement('strong');
        label.textContent = item.label;
        const binding = document.createElement('kbd');
        binding.textContent = item.defaultBinding ?? '未设置默认按键';
        title.append(label, binding);
        container.appendChild(title);

        const description = document.createElement('div');
        description.className = 'shortcut-description';
        description.textContent = item.description;
        container.appendChild(description);

        if (item.conflictWarning) {
          const risk = document.createElement('div');
          risk.className = 'shortcut-risk';
          risk.textContent = '潜在冲突：' + item.conflictWarning;
          container.appendChild(risk);
        }

        const meta = document.createElement('div');
        meta.className = 'shortcut-item-meta';
        const state = document.createElement('span');
        state.className = 'shortcut-description';
        state.textContent = item.enabled ? '已启用' : '已停用';
        meta.appendChild(state);

        if (item.configurableEnablement) {
          const toggle = document.createElement('button');
          toggle.textContent = item.enabled ? '停用' : '启用';
          toggle.addEventListener('click', () => {
            vscode.postMessage({
              type: 'setShortcutEnabled',
              shortcut: item.configurableEnablement,
              enabled: !item.enabled
            });
          });
          meta.appendChild(toggle);
        }

        const edit = document.createElement('button');
        edit.textContent = '编辑按键';
        edit.addEventListener('click', () => {
          vscode.postMessage({ type: 'openShortcutEditor', commandId: item.commandId });
        });
        meta.appendChild(edit);
        container.appendChild(meta);
        elements.shortcutList.appendChild(container);
      }
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
        const errorMessage = typeof payload.error === 'string' ? payload.error : payload.error.message;
        elements.reader.className = 'reader error';
        elements.reader.textContent = errorMessage;
        elements.status.textContent = errorMessage;
        elements.recoveryActions.hidden = false;
        elements.importTxt.hidden = payload.error.kind !== 'missing';
        elements.removeActiveFile.hidden = payload.error.kind !== 'missing';
        elements.switchActiveFileEncoding.hidden = payload.error.kind !== 'decode';
        lastRenderedSignature = undefined;
        return;
      }

      if (!payload?.files?.length) {
        elements.reader.className = 'reader empty';
        elements.reader.textContent = 'No imported TXT files. Run "MoyuPlus: Import TXT" first.';
        elements.status.textContent = '';
        elements.recoveryActions.hidden = false;
        elements.importTxt.hidden = false;
        elements.removeActiveFile.hidden = true;
        elements.switchActiveFileEncoding.hidden = true;
        currentRange = { startOffset: 0, endOffset: 0 };
        lastRenderedSignature = undefined;
        return;
      }

      if (!payload?.activeFile) {
        elements.reader.className = 'reader empty';
        elements.reader.textContent = 'Select a TXT file to start reading.';
        elements.status.textContent = '';
        elements.recoveryActions.hidden = true;
        currentRange = { startOffset: 0, endOffset: 0 };
        lastRenderedSignature = undefined;
        return;
      }

      const startOffset = clamp(session.offset, 0, text.length);
      elements.recoveryActions.hidden = true;
      elements.reader.className = 'reader';
      syncMeasureStyles();
      const endOffset = findMeasuredPageEnd(text, startOffset);
      currentRange = { startOffset, endOffset };
      elements.reader.textContent = text.slice(startOffset, endOffset);
      const percent = text.length ? Math.round((startOffset / text.length) * 100) : 0;
      elements.status.className = 'status';
      elements.status.textContent = percent + '% · ' + startOffset + '/' + text.length;
      postPageRendered(currentRange);
    }

    function scheduleRenderPage() {
      if (renderFrame) {
        return;
      }

      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        renderPage();
      });
    }

    function syncMeasureStyles() {
      const computed = window.getComputedStyle(elements.reader);
      elements.measure.style.width = Math.max(elements.reader.clientWidth, 1) + 'px';
      elements.measure.style.padding = computed.padding;
      elements.measure.style.fontFamily = computed.fontFamily;
      elements.measure.style.fontSize = computed.fontSize;
      elements.measure.style.fontWeight = computed.fontWeight;
      elements.measure.style.fontStyle = computed.fontStyle;
      elements.measure.style.lineHeight = computed.lineHeight;
      elements.measure.style.letterSpacing = computed.letterSpacing;
      elements.measure.style.tabSize = computed.tabSize;
    }

    function findMeasuredPageEnd(text, startOffset) {
      if (startOffset >= text.length) {
        return text.length;
      }

      const maxHeight = Math.max(elements.reader.clientHeight, 1);
      let high = Math.min(text.length, startOffset + 256);
      let best = startOffset;

      while (high < text.length && measureRangeFits(text, startOffset, high, maxHeight)) {
        best = high;
        high = Math.min(text.length, startOffset + Math.max((high - startOffset) * 2, 1));
      }

      if (high === text.length && measureRangeFits(text, startOffset, high, maxHeight)) {
        return text.length;
      }

      let low = best + 1;
      while (low <= high) {
        const middle = low + Math.floor((high - low) / 2);
        if (measureRangeFits(text, startOffset, middle, maxHeight)) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }

      if (best <= startOffset) {
        return Math.min(text.length, startOffset + 1);
      }

      return refinePageEndToBoundary(text, startOffset, best);
    }

    function measureRangeFits(text, startOffset, endOffset, maxHeight) {
      elements.measure.textContent = text.slice(startOffset, endOffset);
      return elements.measure.scrollHeight <= maxHeight;
    }

    function refinePageEndToBoundary(text, startOffset, endOffset) {
      const minimum = startOffset + Math.max(1, Math.floor((endOffset - startOffset) * 0.6));
      const newline = text.lastIndexOf('\\n', endOffset - 1);
      if (newline >= minimum) {
        return newline + 1;
      }

      for (let index = endOffset - 1; index >= minimum; index--) {
        if (/[\t .,;:!?)]/.test(text[index])) {
          return index + 1;
        }
      }

      return endOffset;
    }

    function postPageRendered(range) {
      const viewportSnapshot = getViewportSnapshot();
      const signature = JSON.stringify({ range, viewportSnapshot });
      if (signature === lastRenderedSignature) {
        return;
      }

      lastRenderedSignature = signature;
      vscode.postMessage({
        type: 'pageRendered',
        range,
        viewportSnapshot
      });
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
