import type { BookFormat, BookRecord, BookSource, TxtEncoding } from '../domain/books';
import type { ReadingLocator } from '../domain/locators';
import type { ImmersiveTextProjection } from '../domain/immersiveProjection';

export interface BookMetadata { title: string; authors: string[]; source?: BookSource; encoding?: TxtEncoding; packageIdentifier?: string }
export interface TocNode { title: string; sectionId: string; fragment?: string; children?: TocNode[] }
export interface SectionRef { id: string; title?: string; order: number; progressionWeight: number }
export interface LocalResourceRef { id: string; mimeType: string; label: string }
export interface PreviewImagePayload { bytes: Uint8Array; mimeType: string; label: string }
export type SectionLocatorSpace =
  | { kind: 'txt'; sectionStart: number; sectionEnd: number }
  | { kind: 'epub'; sourceRevision: string; projectionRevision: string };
export interface SafeSectionDocument {
  sectionId: string;
  title?: string;
  sanitizedHtml: string;
  localResources: LocalResourceRef[];
  sourceRevision: string;
  immersiveProjection: ImmersiveTextProjection;
  locatorSpace: SectionLocatorSpace;
}
export interface BookHandle<L extends ReadingLocator = ReadingLocator> {
  getToc(): Promise<TocNode[]>; getSections(): Promise<SectionRef[]>; getSection(sectionId: string): Promise<SafeSectionDocument>; readResource(sectionId: string, resourceId: string): Promise<PreviewImagePayload>; normalizeLocator(locator: ReadingLocator): Promise<L>; dispose(): void;
}
export interface BookAdapter<L extends ReadingLocator = ReadingLocator> {
  readonly format: BookFormat; inspect(uri: string, options?: { encoding?: TxtEncoding }): Promise<BookMetadata>; open(book: BookRecord): Promise<BookHandle<L>>;
}
