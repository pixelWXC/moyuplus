import { type ImportedTxtFile, type PageRange, type ReaderSession, type ReaderViewportSnapshot } from '../domain/models';
import { type ShortcutEnablement, type ShortcutSettingItem } from '../shortcuts/shortcutSettings';
import { normalizeReadingLocator, type ReadingLocator } from '../domain/locators';
import type { SafeSectionDocument, SectionRef, TocNode } from '../adapters/bookAdapter';

export const READER_VIEW_ID = 'moyuplus.readerView';
export const READER_PROTOCOL_VERSION = 2 as const;

interface V2Envelope {
  version: typeof READER_PROTOCOL_VERSION;
  requestId: string;
  bookId: string;
}

interface V2SectionEnvelope extends V2Envelope { sectionId: string }

export type ReaderToExtensionV2Message =
  | (V2Envelope & { type: 'openBook' })
  | (V2SectionEnvelope & { type: 'requestSection' | 'requestNextSection' | 'requestPreviousSection' })
  | (V2SectionEnvelope & { type: 'layoutStable'; locator: ReadingLocator; bookProgression: number });

export type ExtensionToReaderV2Message =
  | (V2Envelope & { type: 'bookReady'; toc: TocNode[]; sections: SectionRef[]; initialSectionId: string })
  | (V2SectionEnvelope & { type: 'sectionReady'; section: SafeSectionDocument })
  | (V2SectionEnvelope & { type: 'bookStart' | 'bookEnd' })
  | (V2Envelope & { type: 'readerError'; code: string; message: string });

export function isReaderToExtensionV2Message(value: unknown): value is ReaderToExtensionV2Message {
  if (!hasEnvelope(value)) return false;
  if (value.type === 'openBook') return true;
  if (!hasSectionEnvelope(value)) return false;
  if (value.type === 'requestSection' || value.type === 'requestNextSection' || value.type === 'requestPreviousSection') return true;
  if (value.type !== 'layoutStable' || !isProgression(value.bookProgression)) return false;
  const locator = normalizeReadingLocator(value.locator);
  return locator !== undefined && locator.sectionId === value.sectionId;
}

export function isExtensionToReaderV2Message(value: unknown): value is ExtensionToReaderV2Message {
  if (!hasEnvelope(value)) return false;
  if (value.type === 'readerError') return isNonEmptyString(value.code) && isNonEmptyString(value.message);
  if (value.type === 'bookReady') {
    return Array.isArray(value.toc) && value.toc.every(isTocNode)
      && Array.isArray(value.sections) && value.sections.every(isSectionRef)
      && isNonEmptyString(value.initialSectionId)
      && value.sections.some(section => isRecord(section) && section.id === value.initialSectionId);
  }
  if (!hasSectionEnvelope(value)) return false;
  if (value.type === 'bookStart' || value.type === 'bookEnd') return true;
  return value.type === 'sectionReady' && isSafeSection(value.section, value.sectionId);
}

function hasEnvelope(value: unknown): value is Record<string, unknown> & V2Envelope {
  return isRecord(value)
    && value.version === READER_PROTOCOL_VERSION
    && isNonEmptyString(value.requestId)
    && isNonEmptyString(value.bookId);
}

function hasSectionEnvelope(value: Record<string, unknown> & V2Envelope): value is Record<string, unknown> & V2SectionEnvelope {
  return isNonEmptyString(value.sectionId);
}

function isSafeSection(value: unknown, sectionId: string): value is SafeSectionDocument {
  if (!isRecord(value) || value.sectionId !== sectionId || typeof value.sanitizedHtml !== 'string'
    || !isNonEmptyString(value.sourceRevision) || !Array.isArray(value.localResources)) return false;
  return value.localResources.every(resource => isRecord(resource)
    && isNonEmptyString(resource.id) && isNonEmptyString(resource.path) && isNonEmptyString(resource.mimeType));
}

function isTocNode(value: unknown): value is TocNode {
  if (!isRecord(value) || !isNonEmptyString(value.title) || !isNonEmptyString(value.sectionId)) return false;
  if (value.fragment !== undefined && !isNonEmptyString(value.fragment)) return false;
  return value.children === undefined || (Array.isArray(value.children) && value.children.every(isTocNode));
}

function isSectionRef(value: unknown): value is SectionRef {
  return isRecord(value) && isNonEmptyString(value.id)
    && (value.title === undefined || isNonEmptyString(value.title))
    && Number.isInteger(value.order) && (value.order as number) >= 0
    && typeof value.progressionWeight === 'number' && Number.isFinite(value.progressionWeight) && value.progressionWeight >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isProgression(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export type ReaderViewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'selectFile'; fileId: string }
  | { type: 'pageRendered'; range: PageRange; viewportSnapshot?: ReaderViewportSnapshot }
  | { type: 'nextPage'; currentRange: PageRange; viewportSnapshot?: ReaderViewportSnapshot }
  | { type: 'previousPage' }
  | { type: 'setFontSize'; fontSize: number }
  | { type: 'openShortcutSettings' }
  | { type: 'openShortcutEditor'; commandId: string }
  | { type: 'setShortcutEnabled'; shortcut: ShortcutEnablement; enabled: boolean }
  | { type: 'importTxt' }
  | { type: 'removeActiveFile' }
  | { type: 'switchActiveFileEncoding' };

export interface ReaderErrorState {
  kind: 'missing' | 'decode' | 'notImported' | 'generic';
  message: string;
}

export interface ReaderStatePayload {
  files: ImportedTxtFile[];
  session: ReaderSession;
  activeFile?: ImportedTxtFile;
  text?: string;
  error?: ReaderErrorState;
  shortcuts: ShortcutSettingItem[];
}

export type ExtensionToReaderMessage =
  | { type: 'state'; payload: ReaderStatePayload }
  | { type: 'error'; message: string }
  | { type: 'command'; command: 'nextPage' };
