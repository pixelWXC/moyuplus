import { describe, expect, it } from 'vitest';
import {
  READER_PROTOCOL_VERSION,
  isExtensionToReaderV2Message,
  isReaderToExtensionV2Message
} from '../../reader/readerMessages';

describe('Reader v3 message protocol', () => {
  it('uses protocol v3 and validates correlated target and image requests', () => {
    expect(READER_PROTOCOL_VERSION).toBe(3);
    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'requestSectionTarget',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'notes',
      fragment: 'note-4'
    })).toBe(true);
    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'openImage',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'chapter-1',
      sectionGeneration: 4,
      resourceId: 'image-opaque-id'
    })).toBe(true);
    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'openImage',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'chapter-1',
      sectionGeneration: 0,
      resourceId: '../images/cover.png'
    })).toBe(false);
  });

  it('validates correlated section generations and navigation state', () => {
    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'targetUnavailable',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'notes',
      sectionGeneration: 8,
      message: '目标位置不可用'
    })).toBe(true);
    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'imageOpenFailed',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'chapter-1',
      sectionGeneration: 8,
      message: '图片无法打开'
    })).toBe(true);
    expect(isReaderToExtensionV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'navigationState',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'chapter-1',
      sectionGeneration: 8,
      canPreviousPage: true,
      canNextPage: false,
      canUndoLocation: true
    })).toBe(true);
  });

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
      sectionGeneration: 3,
      section: {
        sectionId: 'section-1',
        sanitizedHtml: '<p>Safe</p>',
        localResources: [{ id: 'cover-id', mimeType: 'image/png', label: 'Cover' }],
        sourceRevision: 'revision-1'
      }
    })).toBe(true);

    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'sectionReady',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'section-1',
      sectionGeneration: 3,
      section: { sectionId: 'section-1', rawHtml: '<script>bad()</script>' }
    })).toBe(false);
  });

  it('deeply validates book metadata and permits a sanitized empty section', () => {
    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'bookReady',
      requestId: 'request-1',
      bookId: 'book-1',
      initialSectionId: 'section-1',
      initialLocator: { kind: 'epub', sectionId: 'section-1', progression: 0.4 },
      toc: [{ title: 'Chapter', sectionId: 'section-1', children: [] }],
      sections: [{ id: 'section-1', title: 'Chapter', order: 0, progressionWeight: 1 }]
    })).toBe(true);
    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'bookReady',
      requestId: 'request-1',
      bookId: 'book-1',
      initialSectionId: 'section-1',
      initialLocator: { kind: 'epub', sectionId: 'section-1', progression: 0.4 },
      toc: [{ title: '', sectionId: 42 }],
      sections: [{ id: 'section-1', order: -1, progressionWeight: 2 }]
    })).toBe(false);
    expect(isExtensionToReaderV2Message({
      version: READER_PROTOCOL_VERSION,
      type: 'sectionReady',
      requestId: 'request-1',
      bookId: 'book-1',
      sectionId: 'section-1',
      sectionGeneration: 3,
      section: { sectionId: 'section-1', sanitizedHtml: '', localResources: [], sourceRevision: 'revision-1' }
    })).toBe(true);
  });

  it('rejects unknown protocol versions, message types, and empty correlation ids', () => {
    expect(isReaderToExtensionV2Message({ version: 99, type: 'openBook', requestId: 'r', bookId: 'b' })).toBe(false);
    expect(isReaderToExtensionV2Message({ version: READER_PROTOCOL_VERSION, type: 'unknown', requestId: 'r', bookId: 'b' })).toBe(false);
    expect(isExtensionToReaderV2Message({ version: READER_PROTOCOL_VERSION, type: 'bookEnd', requestId: '', bookId: 'b', sectionId: 's' })).toBe(false);
  });
});
