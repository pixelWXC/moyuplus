import { describe, expect, it, vi } from 'vitest';
import { ResourceManager } from '../../webview/resourceManager';

describe('ResourceManager', () => {
  it('creates URLs only for declared safe resources and revokes them on section change', () => {
    const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}`);
    const revokeObjectURL = vi.fn();
    const manager = new ResourceManager({ createObjectURL, revokeObjectURL });

    manager.beginSection([
      { id: 'cover', path: 'images/cover.png', mimeType: 'image/png' }
    ]);
    const url = manager.create({ id: 'cover', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });

    expect(url).toBe('blob:image/png');
    expect(manager.create({ id: 'remote', mimeType: 'image/png', bytes: new Uint8Array() })).toBeUndefined();
    manager.beginSection([]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image/png');
  });

  it('rejects a MIME mismatch and active-content MIME types', () => {
    const manager = new ResourceManager({ createObjectURL: vi.fn(() => 'blob:safe'), revokeObjectURL: vi.fn() });
    manager.beginSection([
      { id: 'cover', path: 'cover.png', mimeType: 'image/png' },
      { id: 'script', path: 'script.js', mimeType: 'application/javascript' }
    ]);

    expect(manager.create({ id: 'cover', mimeType: 'image/jpeg', bytes: new Uint8Array() })).toBeUndefined();
    expect(manager.create({ id: 'script', mimeType: 'application/javascript', bytes: new Uint8Array() })).toBeUndefined();
  });

  it('reuses one URL per resource and revokes all URLs on dispose', () => {
    const createObjectURL = vi.fn(() => 'blob:cover');
    const revokeObjectURL = vi.fn();
    const manager = new ResourceManager({ createObjectURL, revokeObjectURL });
    manager.beginSection([{ id: 'cover', path: 'cover.webp', mimeType: 'image/webp' }]);
    const payload = { id: 'cover', mimeType: 'image/webp', bytes: new Uint8Array([1]) };

    expect(manager.create(payload)).toBe(manager.create(payload));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    manager.dispose();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(manager.create(payload)).toBeUndefined();
  });
});
