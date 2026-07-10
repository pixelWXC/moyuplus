import type { BookFormat } from '../domain/books';
import type { BookAdapter } from './bookAdapter';
export class AdapterRegistry {
  private readonly adapters = new Map<BookFormat, BookAdapter>();
  constructor(adapters: BookAdapter[] = []) { for (const adapter of adapters) this.register(adapter); }
  register(adapter: BookAdapter): void { if (this.adapters.has(adapter.format)) throw new Error(`Adapter already registered for ${adapter.format}.`); this.adapters.set(adapter.format, adapter); }
  get(format: BookFormat): BookAdapter { const adapter = this.adapters.get(format); if (!adapter) throw new Error(`No adapter registered for ${format}.`); return adapter; }
}
