import { describe, expect, it, vi } from 'vitest';
import { AdapterRegistry } from '../../adapters/adapterRegistry';
import type { BookAdapter } from '../../adapters/bookAdapter';
describe('AdapterRegistry', () => {
  const adapter = (format: 'txt' | 'epub'): BookAdapter => ({ format, inspect: vi.fn(), open: vi.fn() });
  it('resolves formats and rejects unknown or duplicate formats', () => {
    const registry = new AdapterRegistry([adapter('txt')]);
    expect(registry.get('txt').format).toBe('txt');
    expect(() => registry.get('epub')).toThrow(/No adapter/);
    expect(() => registry.register(adapter('txt'))).toThrow(/already registered/);
  });
});
