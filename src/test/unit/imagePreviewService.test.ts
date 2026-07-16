import { beforeEach, describe, expect, it } from 'vitest';
import {
  IMAGE_PREVIEW_VIEW_TYPE,
  MoyuplusImagePreviewService,
  registerMoyuplusImagePreviewService
} from '../../reader/imagePreviewService';
import { commands, createWebviewView, resetVSCodeShim, type Disposable, type Uri, window } from '../shims/vscode';

describe('MoyuplusImagePreviewService', () => {
  beforeEach(() => resetVSCodeShim());

  it('registers a readonly custom editor and opens an in-memory preview tab', async () => {
    const context = { subscriptions: [] as Disposable[] };
    const service = registerMoyuplusImagePreviewService(context as never, { createId: () => 'preview-1' });
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(service.open({ bytes, mimeType: 'image/png', label: 'Cover' })).resolves.toBe(true);
    bytes[0] = 9;

    expect(window.registeredCustomEditorProviderIds()).toEqual([IMAGE_PREVIEW_VIEW_TYPE]);
    const call = commands.executedBuiltinCommands().at(-1);
    expect(call?.commandId).toBe('vscode.openWith');
    expect(call?.args.slice(1)).toEqual([IMAGE_PREVIEW_VIEW_TYPE, { preview: true }]);

    const uri = call?.args[0] as Uri;
    const document = await service.openCustomDocument(uri as never, {} as never, {} as never);
    const panel = { webview: createWebviewView().webview };
    await service.resolveCustomEditor(document, panel as never, {} as never);

    expect(panel.webview.options.enableScripts).toBe(true);
    expect(panel.webview.html).toContain("default-src 'none'");
    expect(panel.webview.html).toContain("img-src blob: data:");
    expect(panel.webview.html).toContain("connect-src 'none'");
    expect(panel.webview.html).toContain('AQID');
    expect(panel.webview.html).toContain('URL.revokeObjectURL');
    expect(panel.webview.html).not.toMatch(/https?:\/\//i);

    document.dispose();
    expect(() => service.openCustomDocument(uri as never, {} as never, {} as never)).toThrow(/preview|document/i);
  });

  it('cleans a failed open and refuses new work after dispose', async () => {
    const service = new MoyuplusImagePreviewService({ createId: () => 'failed-preview' });
    commands.failNextBuiltinCommand('vscode.openWith', new Error('open failed'));

    await expect(service.open({ bytes: new Uint8Array([1]), mimeType: 'image/png', label: 'Cover' })).resolves.toBe(false);
    const uri = commands.executedBuiltinCommands().at(-1)?.args[0] as Uri;
    expect(() => service.openCustomDocument(uri as never, {} as never, {} as never)).toThrow(/preview|document/i);

    service.dispose();
    await expect(service.open({ bytes: new Uint8Array([1]), mimeType: 'image/png', label: 'Cover' })).resolves.toBe(false);
  });
});
