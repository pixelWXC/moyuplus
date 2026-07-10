import type { LocalResourceRef } from '../adapters/bookAdapter';

export interface ResourcePayload { id: string; mimeType: string; bytes: Uint8Array }
export interface ObjectUrlApi { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void }

const SAFE_MIME_TYPES = new Set([
  'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp',
  'font/otf', 'font/ttf', 'font/woff', 'font/woff2'
]);

export class ResourceManager {
  private readonly declarations = new Map<string, LocalResourceRef>();
  private readonly urls = new Map<string, string>();
  private disposed = false;

  public constructor(private readonly urlApi: ObjectUrlApi) {}

  public beginSection(resources: LocalResourceRef[]): void {
    if (this.disposed) return;
    this.revokeAll();
    this.declarations.clear();
    for (const resource of resources) {
      if (SAFE_MIME_TYPES.has(resource.mimeType)) this.declarations.set(resource.id, resource);
    }
  }

  public create(payload: ResourcePayload): string | undefined {
    if (this.disposed) return undefined;
    const declaration = this.declarations.get(payload.id);
    if (!declaration || declaration.mimeType !== payload.mimeType || !SAFE_MIME_TYPES.has(payload.mimeType)) return undefined;
    const existing = this.urls.get(payload.id);
    if (existing) return existing;
    const bytes = payload.bytes.slice();
    const url = this.urlApi.createObjectURL(new Blob([bytes], { type: payload.mimeType }));
    this.urls.set(payload.id, url);
    return url;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.revokeAll();
    this.declarations.clear();
    this.disposed = true;
  }

  private revokeAll(): void {
    for (const url of this.urls.values()) this.urlApi.revokeObjectURL(url);
    this.urls.clear();
  }
}
