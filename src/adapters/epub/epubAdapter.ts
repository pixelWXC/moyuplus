import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { BookRecord } from '../../domain/books';
import type { EpubLocator, ReadingLocator } from '../../domain/locators';
import { normalizeProgression } from '../../domain/locators';
import type { BookAdapter, BookHandle, BookMetadata, PreviewImagePayload, SafeSectionDocument, SectionRef, TocNode } from '../bookAdapter';
import { EpubArchive } from './epubArchive';
import { parseEpubPackage, type EpubPackage } from './epubPackageParser';
import { sanitizeEpubSection } from './epubSanitizer';
import { validateEpubImage } from './epubImageSecurity';
export class EpubAdapter implements BookAdapter<EpubLocator> {
  readonly format = 'epub' as const;
  async inspect(uri: string): Promise<BookMetadata> { const archive = await EpubArchive.open(fileURLToPath(uri)); try { const pkg = await parseEpubPackage(archive); return { title: pkg.metadata.title, authors: pkg.metadata.authors, packageIdentifier: pkg.metadata.identifier }; } finally { archive.dispose(); } }
  async open(book: BookRecord): Promise<EpubBookHandle> { if (book.format !== 'epub') throw new Error('EpubAdapter can only open EPUB books.'); const archive = await EpubArchive.open(fileURLToPath(book.uri)); try { return new EpubBookHandle(archive, await parseEpubPackage(archive)); } catch (error) { archive.dispose(); throw error; } }
}
class EpubBookHandle implements BookHandle<EpubLocator> {
  private disposed = false;
  private readonly declaredResources = new Map<string, Map<string, { path: string; mimeType: string; label: string }>>();
  constructor(private readonly archive: EpubArchive, private readonly pkg: EpubPackage) {}
  async getToc(): Promise<TocNode[]> { this.assertOpen(); return structuredClone(this.pkg.toc); }
  async getSections(): Promise<SectionRef[]> { this.assertOpen(); return this.pkg.sections.map(({ id, title, order, progressionWeight }) => ({ id, title, order, progressionWeight })); }
  async getSection(sectionId: string): Promise<SafeSectionDocument> { this.assertOpen(); const section = this.pkg.sections.find((x) => x.id === sectionId); if (!section) throw new Error(`Unknown EPUB section: ${sectionId}`); const source = await this.archive.readText(section.href); const readableSections = new Map(this.pkg.sections.map(item => [item.href, item.id])); const manifestImages = [...this.pkg.manifest.values()].filter(isSupportedManifestImage); const imageResources = new Map(manifestImages.map(item => [item.href, { id: createHash('sha256').update(item.href).digest('hex').slice(0, 16), mimeType: item.mediaType }])); const sanitized = sanitizeEpubSection(source, { basePath: section.href, readableSections, imageResources }); const resourcePaths = new Map([...imageResources.entries()].map(([resourcePath, declaration]) => [declaration.id, resourcePath])); this.declaredResources.set(sectionId, new Map(sanitized.resources.map(resource => [resource.id, { path: resourcePaths.get(resource.id)!, mimeType: resource.mimeType, label: resource.label }]))); return { sectionId, title: section.title, sanitizedHtml: sanitized.html, localResources: sanitized.resources, sourceRevision: createHash('sha256').update('sanitizer-v3\0').update(source).digest('hex') }; }
  async readResource(sectionId: string, resourceId: string): Promise<PreviewImagePayload> { this.assertOpen(); const declaration = this.declaredResources.get(sectionId)?.get(resourceId); if (!declaration) throw new Error('EPUB resource was not declared for this section.'); const validated = validateEpubImage(await this.archive.read(declaration.path), declaration.mimeType); return { bytes: validated.bytes, mimeType: validated.mimeType, label: declaration.label }; }
  async normalizeLocator(locator: ReadingLocator): Promise<EpubLocator> { this.assertOpen(); const section = this.pkg.sections.find((x) => x.id === locator.sectionId) ?? this.pkg.sections[0]; const normalized: EpubLocator = { kind: 'epub', sectionId: section.id, progression: normalizeProgression(locator.progression) }; if (locator.kind === 'epub' && this.pkg.sections.some((x) => x.id === locator.sectionId)) { if (locator.cfi) normalized.cfi = locator.cfi; if (locator.fragment) normalized.fragment = locator.fragment; } return normalized; }
  dispose(): void { if (!this.disposed) { this.disposed = true; this.archive.dispose(); } }
  private assertOpen() { if (this.disposed) throw new Error('EPUB book handle is disposed.'); }
}

const IMAGE_EXTENSIONS = new Map<string, Set<string>>([
  ['image/avif', new Set(['.avif'])], ['image/gif', new Set(['.gif'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])], ['image/png', new Set(['.png'])],
  ['image/svg+xml', new Set(['.svg'])], ['image/webp', new Set(['.webp'])]
]);

function isSupportedManifestImage(item: { href: string; mediaType: string }): boolean {
  return IMAGE_EXTENSIONS.get(item.mediaType.toLowerCase())?.has(path.extname(item.href).toLowerCase()) === true;
}
