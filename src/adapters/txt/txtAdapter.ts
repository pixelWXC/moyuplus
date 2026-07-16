import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { BookRecord } from '../../domain/books';
import type { ReadingLocator, TxtLocator } from '../../domain/locators';
import { normalizeProgression } from '../../domain/locators';
import type { BookAdapter, BookHandle, BookMetadata, SafeSectionDocument, SectionRef, TocNode } from '../bookAdapter';
import { decodeTxt, splitPhysicalLines } from './txtEncoding';
import { TxtSectionizer, type TxtSection } from './txtSectionizer';
export class TxtAdapter implements BookAdapter<TxtLocator> {
  readonly format = 'txt' as const;
  constructor(private readonly sectionizer = new TxtSectionizer()) {}
  async inspect(uri: string, options: { encoding?: 'utf8' | 'gbk' } = {}): Promise<BookMetadata> { const file = fileURLToPath(uri); decodeTxt(await fs.readFile(file), options.encoding ?? 'utf8'); return { title: path.basename(file, path.extname(file)), authors: [], encoding: options.encoding ?? 'utf8' }; }
  async open(book: BookRecord): Promise<TxtBookHandle> { if (book.format !== 'txt') throw new Error('TxtAdapter can only open TXT books.'); const buffer = await fs.readFile(fileURLToPath(book.uri)); return new TxtBookHandle(decodeTxt(buffer, book.formatData.encoding), this.sectionizer, createHash('sha256').update(buffer).digest('hex')); }
}
export class TxtBookHandle implements BookHandle<TxtLocator> {
  private readonly sections: TxtSection[]; private disposed = false;
  constructor(private readonly text: string, sectionizer: TxtSectionizer, private readonly revision: string) { this.sections = sectionizer.sectionize(text); }
  async getToc(): Promise<TocNode[]> { this.assertOpen(); return this.sections.map((x) => ({ title: x.title ?? '正文', sectionId: x.id })); }
  async getSections(): Promise<SectionRef[]> { this.assertOpen(); return this.sections.map((x, order) => ({ id: x.id, title: x.title, order, progressionWeight: Math.max(1, x.end - x.start) })); }
  async getSection(id: string): Promise<SafeSectionDocument> { this.assertOpen(); const section = this.sections.find((x) => x.id === id); if (!section) throw new Error(`Unknown TXT section: ${id}`); return { sectionId: id, title: section.title, sanitizedHtml: `<div class="moyuplus-book-content"><pre>${escapeHtml(this.text.slice(section.start, section.end))}</pre></div>`, localResources: [], sourceRevision: this.revision }; }
  async readResource(): Promise<never> { this.assertOpen(); throw new Error('TXT books do not declare resources.'); }
  async normalizeLocator(locator: ReadingLocator): Promise<TxtLocator> { this.assertOpen(); const offset = locator.kind === 'txt' && locator.offset !== undefined ? Math.min(this.text.length, Math.max(0, locator.offset)) : undefined; const section = this.sections.find((x) => x.id === locator.sectionId) ?? (offset === undefined ? this.sections[0] : this.sections.find((x) => offset >= x.start && offset <= x.end) ?? this.sections.at(-1)!); const result: TxtLocator = { kind: 'txt', sectionId: section.id, progression: offset === undefined ? normalizeProgression(locator.progression) : normalizeProgression((offset - section.start) / Math.max(1, section.end - section.start)) }; if (offset !== undefined) result.offset = offset; return result; }
  async getPhysicalLines(): Promise<string[]> { this.assertOpen(); return splitPhysicalLines(this.text); }
  dispose(): void { this.disposed = true; }
  private assertOpen() { if (this.disposed) throw new Error('TXT book handle is disposed.'); }
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]!); }
