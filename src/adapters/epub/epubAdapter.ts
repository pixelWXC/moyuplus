import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { BookRecord } from '../../domain/books';
import type { EpubLocator, ReadingLocator } from '../../domain/locators';
import { normalizeProgression } from '../../domain/locators';
import type { BookAdapter, BookHandle, BookMetadata, LocalResourceRef, SafeSectionDocument, SectionRef, TocNode } from '../bookAdapter';
import { EpubArchive } from './epubArchive';
import { parseEpubPackage, type EpubPackage } from './epubPackageParser';
import { sanitizeEpubSection } from './epubSanitizer';
export class EpubAdapter implements BookAdapter<EpubLocator> {
  readonly format = 'epub' as const;
  async inspect(uri: string): Promise<BookMetadata> { const archive = await EpubArchive.open(fileURLToPath(uri)); try { const pkg = await parseEpubPackage(archive); return { title: pkg.metadata.title, authors: pkg.metadata.authors, packageIdentifier: pkg.metadata.identifier }; } finally { archive.dispose(); } }
  async open(book: BookRecord): Promise<EpubBookHandle> { if (book.format !== 'epub') throw new Error('EpubAdapter can only open EPUB books.'); const archive = await EpubArchive.open(fileURLToPath(book.uri)); try { return new EpubBookHandle(archive, await parseEpubPackage(archive)); } catch (error) { archive.dispose(); throw error; } }
}
class EpubBookHandle implements BookHandle<EpubLocator> {
  private disposed = false;
  constructor(private readonly archive: EpubArchive, private readonly pkg: EpubPackage) {}
  async getToc(): Promise<TocNode[]> { this.assertOpen(); return structuredClone(this.pkg.toc); }
  async getSections(): Promise<SectionRef[]> { this.assertOpen(); return this.pkg.sections.map(({ id, title, order, progressionWeight }) => ({ id, title, order, progressionWeight })); }
  async getSection(sectionId: string): Promise<SafeSectionDocument> { this.assertOpen(); const section = this.pkg.sections.find((x) => x.id === sectionId); if (!section) throw new Error(`Unknown EPUB section: ${sectionId}`); const source = await this.archive.readText(section.href); const allowed = new Set([...this.pkg.manifest.values()].map((x) => x.href)); const sanitized = sanitizeEpubSection(source, { basePath: section.href, allowedResources: allowed }); const localResources: LocalResourceRef[] = sanitized.resources.map((resource) => { const manifest = [...this.pkg.manifest.values()].find((x) => x.href === resource.path); return { id: createHash('sha256').update(resource.path).digest('hex').slice(0, 16), path: resource.path, mimeType: manifest?.mediaType ?? (resource.kind === 'image' ? 'application/octet-stream' : 'font/unknown') }; }); return { sectionId, title: section.title, sanitizedHtml: sanitized.html, localResources, sourceRevision: createHash('sha256').update(source).digest('hex') }; }
  async normalizeLocator(locator: ReadingLocator): Promise<EpubLocator> { this.assertOpen(); const section = this.pkg.sections.find((x) => x.id === locator.sectionId) ?? this.pkg.sections[0]; const normalized: EpubLocator = { kind: 'epub', sectionId: section.id, progression: normalizeProgression(locator.progression) }; if (locator.kind === 'epub' && this.pkg.sections.some((x) => x.id === locator.sectionId)) { if (locator.cfi) normalized.cfi = locator.cfi; if (locator.fragment) normalized.fragment = locator.fragment; } return normalized; }
  dispose(): void { if (!this.disposed) { this.disposed = true; this.archive.dispose(); } }
  private assertOpen() { if (this.disposed) throw new Error('EPUB book handle is disposed.'); }
}
