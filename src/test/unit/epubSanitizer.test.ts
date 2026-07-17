import { describe, expect, it } from 'vitest';
import * as parse5 from 'parse5';
import { sanitizeEpubSection } from '../../adapters/epub/epubSanitizer';
describe('sanitizeEpubSection', () => {
  it('removes active content, external URLs and all publication presentation', () => {
    const result = sanitizeEpubSection('<html><head><link rel="stylesheet" href="book.css"><style>@import "https://x"; p{position:fixed;color:red}</style></head><body class="publication" style="white-space:nowrap" onload="x"><script>x</script><iframe></iframe><p class="lead" style="font-weight:bold" width="900" align="right" onclick="x"><a href="javascript:x">Hi</a><img alt="Cover" src="images/a.png"/></p></body></html>', {
      basePath: 'OPS/ch.xhtml',
      allowedResources: new Set(['OPS/images/a.png']),
      readableSections: new Map([['OPS/ch.xhtml', 'chapter']]),
      imageResources: new Map([['OPS/images/a.png', { id: 'image-opaque-id', mimeType: 'image/png' }]])
    });
    expect(result.html).toContain('moyuplus-book-content');
    expect(result.html).toContain('查看图片：Cover');
    expect(result.html).toContain('data-moyuplus-resource-id="image-opaque-id"');
    expect(result.html).not.toMatch(/<style|<link|\s(?:style|width|align)=|class="(?:publication|lead)"|script|iframe|onload|onclick|javascript:|https:|position|@import|OPS\/images/i);
    expect(result.html).toContain('class="moyuplus-image-link"');
    expect(result.resources).toEqual([{ id: 'image-opaque-id', mimeType: 'image/png', label: 'Cover' }]);
    expect(result.immersiveProjection.text).toContain('Hi');
    expect(result.immersiveProjection.text).not.toContain('查看图片');
    expect(result.immersiveProjection.segments.some(segment => segment.kind === 'hole')).toBe(true);
  });

  it('keeps semantic structure, navigation metadata and UTF-16 text order', () => {
    const source = `<html><body>
      <article id="chapter" lang="zh-CN" xml:lang="zh-CN" dir="ltr" title="章节" role="doc-chapter" aria-label="第一章" data-publisher="drop">
        <h1 name="heading">标题<strong>粗体</strong><em>斜体</em><sup>2</sup></h1>
        <ol start="3" reversed class="numbered"><li value="4">条目</li></ol>
        <table border="1" cellpadding="12"><tr><th id="head" scope="col">列</th><td headers="head" colspan="2" rowspan="1">值</td></tr></table>
        <blockquote><pre style="white-space:nowrap"><code>const 值 = '😀';</code></pre></blockquote>
        <a id="note" href="#chapter" class="footnote">脚注</a>
      </article>
    </body></html>`;
    const result = sanitizeEpubSection(source, {
      basePath: 'OPS/ch.xhtml',
      readableSections: new Map([['OPS/ch.xhtml', 'chapter-1']]),
      imageResources: new Map()
    });

    expect(result.html).toMatch(/<article id="chapter" lang="zh-CN" xml:lang="zh-CN" dir="ltr" title="章节" role="doc-chapter" aria-label="第一章">/);
    expect(result.html).toMatch(/<ol start="3" reversed="">/);
    expect(result.html).toMatch(/<li value="4">条目<\/li>/);
    expect(result.html).toMatch(/<th id="head" scope="col">列<\/th>/);
    expect(result.html).toMatch(/<td headers="head" colspan="2" rowspan="1">值<\/td>/);
    expect(result.html).toContain('data-moyuplus-section-id="chapter-1"');
    expect(result.html).toContain('data-moyuplus-fragment="chapter"');
    expect(result.html).not.toMatch(/\s(?:style|border|cellpadding|data-publisher)=|class="(?:numbered|footnote)"/);
    expect(textContent(result.html)).toBe(textContent(source));
    expect(textContent(result.html).length).toBe(textContent(source).length);
    expect(result.immersiveProjection.text).toContain('标题粗体斜体2');
    expect(result.immersiveProjection.text).toContain('• 条目');
    expect(result.immersiveProjection.text).toContain("const 值 = '😀';");
    expect(result.immersiveProjection.text).toMatch(/列\s*\|\s*值/);
    expect(result.immersiveProjection.projectionRevision).toBe('immersive-projection-v1');
  });

  it('rewrites internal targets structurally and leaves unsafe or unknown links inert', () => {
    const result = sanitizeEpubSection(`
      <html><body>
        <a href="#note-1">Same</a>
        <a href="notes.xhtml#note-2">Cross</a>
        <a href="missing.xhtml#x">Missing</a>
        <a href="//example.com/x">Protocol relative</a>
        <nav>目录噪声</nav>
        <a href="#note-1">↩</a>
        <figure><img src="images/figure.jpg"><figcaption>结构图</figcaption></figure>
        <img src="images/not-manifest.png">
      </body></html>`, {
        basePath: 'OPS/ch.xhtml',
        allowedResources: new Set(['OPS/images/figure.jpg']),
        readableSections: new Map([['OPS/ch.xhtml', 'chapter'], ['OPS/notes.xhtml', 'notes']]),
        imageResources: new Map([['OPS/images/figure.jpg', { id: 'figure-image-id', mimeType: 'image/jpeg' }]])
      });

    expect(result.html).toContain('data-moyuplus-section-id="chapter"');
    expect(result.html).toContain('data-moyuplus-section-id="notes"');
    expect(result.html).toContain('data-moyuplus-fragment="note-2"');
    expect(result.html).toContain('查看图片：结构图');
    expect(result.html).toContain('图片不可用');
    expect(result.html).not.toMatch(/missing\.xhtml|example\.com|moyuplus-resource:|OPS\/images/i);
    expect(result.immersiveProjection.text).not.toMatch(/目录噪声|↩/);
  });
});

function textContent(html: string): string {
  const document: any = parse5.parse(html);
  const body = find(document, 'body');
  return text(body).replace(/\s+/g, ' ').trim();
}

function find(node: any, tagName: string): any {
  if (node?.tagName === tagName) return node;
  for (const child of node?.childNodes ?? []) {
    const result = find(child, tagName);
    if (result) return result;
  }
}

function text(node: any): string {
  return node?.nodeName === '#text' ? node.value : (node?.childNodes ?? []).map(text).join('');
}
