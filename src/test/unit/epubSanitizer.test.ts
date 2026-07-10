import { describe, expect, it } from 'vitest';
import { sanitizeEpubSection } from '../../adapters/epub/epubSanitizer';
describe('sanitizeEpubSection', () => {
  it('removes active content, external URLs, events and unsafe CSS', () => {
    const result = sanitizeEpubSection('<html><head><style>@import "https://x"; p{position:fixed;color:red;background:url(https://x)}</style></head><body onload="x"><script>x</script><iframe></iframe><p style="z-index:9;font-weight:bold" onclick="x"><a href="javascript:x">Hi</a><img src="images/a.png"/></p></body></html>', { basePath: 'OPS/ch.xhtml', allowedResources: new Set(['OPS/images/a.png']) });
    expect(result.html).toContain('moyuplus-book-content'); expect(result.html).toContain('font-weight'); expect(result.html).not.toMatch(/script|iframe|onload|onclick|javascript:|https:|position|z-index|@import/i); expect(result.resources).toEqual([{ path: 'OPS/images/a.png', kind: 'image' }]);
  });
});
