import { describe, expect, it } from 'vitest';
import { validateEpubImage } from '../../adapters/epub/epubImageSecurity';

describe('validateEpubImage', () => {
  it.each([
    ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['image/gif', Buffer.from('GIF89a', 'ascii')],
    ['image/webp', Buffer.from('RIFF0000WEBP', 'ascii')],
    ['image/avif', Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])]
  ])('accepts %s only when magic bytes match the manifest declaration', (mimeType, bytes) => {
    const result = validateEpubImage(bytes, mimeType);
    expect(result.mimeType).toBe(mimeType);
    expect(Buffer.from(result.bytes)).toEqual(bytes);
  });

  it('rejects raster MIME confusion instead of attempting a fallback decoder', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => validateEpubImage(png, 'image/jpeg')).toThrow(/MIME|content/i);
    expect(() => validateEpubImage(Buffer.from('plain text'), 'image/png')).toThrow(/MIME|content/i);
  });

  it('replaces raw SVG bytes with a sanitized serialization', () => {
    const source = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" onload="bad()">
        <script>bad()</script><foreignObject><p>bad</p></foreignObject>
        <animate attributeName="x"/><image href="https://example.com/x.png"/>
        <style>path{fill:url(https://example.com/x)}</style>
        <path id="safe" d="M0 0L2 2" fill="#123456"/>
      </svg>`);
    const result = validateEpubImage(source, 'image/svg+xml');
    const sanitized = Buffer.from(result.bytes).toString('utf8');

    expect(result.mimeType).toBe('image/svg+xml');
    expect(sanitized).toContain('path');
    expect(sanitized).not.toMatch(/script|foreignObject|animate|onload|https?:|url\s*\(|<image/i);
    expect(Buffer.from(result.bytes)).not.toEqual(source);
  });
});
