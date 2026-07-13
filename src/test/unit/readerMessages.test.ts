import { describe, expect, it } from 'vitest';
import {
  READER_PROTOCOL_VERSION,
  isExtensionToReaderV2Message,
  isReaderToExtensionV2Message
} from '../../reader/readerMessages';

describe('Reader v2 message protocol', () => {
  it('accepts open messages without a section id', () => {
    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'openBook',
      requestId: 'request-1',
      bookId: 'book-1'
    })).toBe(true);
  });

  it('requires a section id after a section has been selected', () => {
    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'layoutStable',
      requestId: 'request-1',
      bookId: 'book-1',
      locator: { kind: 'txt', sectionId: 'section-1', progression: 0.5, offset: 10 },
      bookProgression: 0.5
    })).toBe(false);

    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'layoutStable',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'section-1',
      locator: { kind: 'txt', sectionId: 'section-1', progression: 0.5, offset: 10 },
      bookProgression: 0.5
    })).toBe(true);
  });

  it('rejects mismatched locator and envelope section ids', () => {
    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'layoutStable',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'section-1',
      locator: { kind: 'epub', sectionId: 'section-2', progression: 0.25 },
      bookProgression: 0.25
    })).toBe(false);
  });

  it('validates safe section responses and rejects unsanitized payload shapes', () => {
    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'sectionReady',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'section-1',
      section: {
        sectionId: 'section-1',
        sanitizedHtml: '<p>Safe</p>',
        localResources: [{ id: 'cover', path: 'images/cover.png', mimeType: 'image/png' }],
        sourceRevision: 'revision-1'
      }
    })).toBe(true);

    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'sectionReady',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'section-1',
      section: { sectionId: 'section-1', rawHtml: '<script>bad()</script>' }
    })).toBe(false);
  });

  it('deeply validates book metadata and permits a sanitized empty section', () => {
    expect(isExtensionToReaderV2Message({
      version: 2,
      type: 'bookReady',
      requestId: 'request-1',
      bookId: 'book-1',
      initialSectionId: 'section-1',
      initialLocator: { kind: 'epub', sectionId: 'section-1', progression: 0.4 },
      toc: [{ title: 'Chapter', sectionId: 'section-1', children: [] }],
      sections: [{ id: 'section-1', title: 'Chapter', order: 0, progressionWeight: 1 }]
    })).toBe(true);
    expect(isExtensionToReaderV2Message({
      version: 2,
      type: 'bookReady',
      requestId: 'request-1',
      bookId: 'book-1',
      initialSectionId: 'section-1',
      initialLocator: { kind: 'epub', sectionId: 'section-1', progression: 0.4 },
      toc: [{ title: '', sectionId: 42 }],
      sections: [{ id: 'section-1', order: -1, progressionWeight: 2 }]
    })).toBe(false);
    expect(isExtensionToReaderV2Message({
      version: 2,
      type: 'sectionReady',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'section-1',
      section: { sectionId: 'section-1', sanitizedHtml: '', localResources: [], sourceRevision: 'revision-1' }
    })).toBe(true);
  });

  it('rejects unknown protocol versions, message types, and empty correlation ids', () => {
    expect(isReaderToExtensionV2Message({ version: 99, type: 'openBook', requestId: 'r', bookId: 'b' })).toBe(false);
    expect(isReaderToExtensionV2Message({ version: 2, type: 'unknown', requestId: 'r', bookId: 'b' })).toBe(false);
    expect(isExtensionToReaderV2Message({ version: 2, type: 'bookEnd', requestId: '', bookId: 'b', sectionId: 's' })).toBe(false);
  });
});
