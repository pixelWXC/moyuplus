import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PreviewImagePayload } from '../adapters/bookAdapter';

export const IMAGE_PREVIEW_VIEW_TYPE = 'moyuplus.imagePreview';

export interface ImagePreviewServiceOptions {
  createId?: () => string;
}

interface ImagePreviewDocument extends vscode.CustomDocument {
  readonly payload: PreviewImagePayload;
}

export class MoyuplusImagePreviewService implements vscode.CustomReadonlyEditorProvider<ImagePreviewDocument>, vscode.Disposable {
  private readonly records = new Map<string, PreviewImagePayload>();
  private readonly createId: () => string;
  private disposed = false;

  constructor(options: ImagePreviewServiceOptions = {}) {
    this.createId = options.createId ?? randomUUID;
  }

  async open(payload: PreviewImagePayload): Promise<boolean> {
    if (this.disposed || !SAFE_PREVIEW_MIME_TYPES.has(payload.mimeType)) return false;
    const uri = vscode.Uri.parse(`moyuplus-image:/${encodeURIComponent(this.createId())}.moyuplus-image`);
    const key = uri.toString();
    this.records.set(key, {
      bytes: Uint8Array.from(payload.bytes),
      mimeType: payload.mimeType,
      label: payload.label.trim() || '书籍图片'
    });
    try {
      await vscode.commands.executeCommand('vscode.openWith', uri, IMAGE_PREVIEW_VIEW_TYPE, { preview: true });
      return true;
    } catch {
      this.records.delete(key);
      return false;
    }
  }

  openCustomDocument(uri: vscode.Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): ImagePreviewDocument {
    const key = uri.toString();
    const payload = this.records.get(key);
    if (this.disposed || !payload) throw new Error('Image preview document is no longer available.');
    let released = false;
    return {
      uri,
      payload: { bytes: Uint8Array.from(payload.bytes), mimeType: payload.mimeType, label: payload.label },
      dispose: () => {
        if (released) return;
        released = true;
        this.records.delete(key);
      }
    };
  }

  resolveCustomEditor(document: ImagePreviewDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): void {
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewPanel.webview.html = imagePreviewHtml(document.payload);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.records.clear();
  }
}

export function registerMoyuplusImagePreviewService(
  context: vscode.ExtensionContext,
  options: ImagePreviewServiceOptions = {}
): MoyuplusImagePreviewService {
  const service = new MoyuplusImagePreviewService(options);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(IMAGE_PREVIEW_VIEW_TYPE, service),
    service
  );
  return service;
}

const SAFE_PREVIEW_MIME_TYPES = new Set([
  'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'
]);

function imagePreviewHtml(payload: PreviewImagePayload): string {
  const nonce = randomBytes(18).toString('base64url');
  const bytes = Buffer.from(payload.bytes).toString('base64');
  const mimeType = safeJson(payload.mimeType);
  const label = safeJson(payload.label || '书籍图片');
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    'img-src blob: data:',
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
  <title>MoyuPlus 图片预览</title>
  <style nonce="${nonce}">
    html, body { width: 100%; height: 100%; margin: 0; }
    body { display: grid; place-items: center; overflow: auto; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
    img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <img id="preview" alt="">
  <script nonce="${nonce}">
    (() => {
      const encoded = '${bytes}';
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const image = document.getElementById('preview');
      image.alt = ${label};
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: ${mimeType} }));
      image.src = objectUrl;
      let revoked = false;
      const revoke = () => { if (!revoked) { revoked = true; URL.revokeObjectURL(objectUrl); } };
      window.addEventListener('pagehide', revoke, { once: true });
      window.addEventListener('beforeunload', revoke, { once: true });
    })();
  </script>
</body>
</html>`;
}

function safeJson(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
