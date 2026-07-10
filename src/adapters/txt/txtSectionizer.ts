import { createHash } from 'node:crypto';
export interface TxtSection { id: string; title?: string; start: number; end: number }
const HEADING = /^(?:第[0-9零〇一二三四五六七八九十百千万两]+[章节回卷部篇].*|(?:chapter|part|book)\s+[0-9ivxlcdm]+\b.*)$/i;
export class TxtSectionizer {
  private readonly max: number;
  constructor(options: { maxSectionChars?: number } = {}) { this.max = Math.max(1, options.maxSectionChars ?? 120_000); }
  sectionize(text: string): TxtSection[] {
    if (!text) return [this.make('', 0, 0, '正文')];
    const headings: Array<{ start: number; title: string }> = []; const lines = /.*(?:\r\n|\n|\r|$)/g; let match: RegExpExecArray | null;
    while ((match = lines.exec(text)) && match[0]) { const title = match[0].replace(/[\r\n]+$/, '').trim(); if (HEADING.test(title)) headings.push({ start: match.index, title }); }
    if (headings.length) {
      const starts = headings[0].start > 0 ? [{ start: 0, title: text.slice(0, headings[0].start).split(/\r?\n/, 1)[0].trim() || '序言' }, ...headings] : headings;
      return starts.map((item, i) => this.make(text, item.start, starts[i + 1]?.start ?? text.length, item.title));
    }
    if (text.length <= this.max) return [this.make(text, 0, text.length, '正文')];
    const result: TxtSection[] = []; for (let start = 0; start < text.length;) { let end = Math.min(text.length, start + this.max); if (end < text.length) { const newline = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('\r', end)); if (newline > start) end = newline + 1; } result.push(this.make(text, start, end, `第 ${result.length + 1} 节`)); start = end; } return result;
  }
  private make(text: string, start: number, end: number, title: string): TxtSection { const digest = createHash('sha1').update(`txt-section-v1:${start}:${end}:${text.slice(start, Math.min(end, start + 128))}`).digest('hex').slice(0, 16); return { id: `txt-${digest}`, title, start, end }; }
}
