import { describe, expect, it } from 'vitest';
import { TxtSectionizer } from '../../adapters/txt/txtSectionizer';
describe('TxtSectionizer', () => {
  it('recognizes headings without losing characters', () => {
    const text = '序言\n内容\n第一章 开始\r\n正文\nChapter 2 The End\n结尾';
    const sections = new TxtSectionizer().sectionize(text);
    expect(sections.map((x) => x.title)).toEqual(['序言', '第一章 开始', 'Chapter 2 The End']);
    expect(sections.map((x) => text.slice(x.start, x.end)).join('')).toBe(text);
    expect(sections.every((x, i) => i === 0 || x.start === sections[i - 1].end)).toBe(true);
  });
  it('uses deterministic chunks for large heading-free text and one section for small or empty text', () => {
    const sectionizer = new TxtSectionizer({ maxSectionChars: 20 });
    const text = 'a'.repeat(53);
    const first = sectionizer.sectionize(text);
    expect(first).toHaveLength(3);
    expect(first.map((x) => x.id)).toEqual(sectionizer.sectionize(text).map((x) => x.id));
    expect(first.map((x) => text.slice(x.start, x.end)).join('')).toBe(text);
    expect(sectionizer.sectionize('short')).toHaveLength(1);
    expect(sectionizer.sectionize('')).toHaveLength(1);
  });
});
