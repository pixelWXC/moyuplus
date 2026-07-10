import { describe, expect, it } from 'vitest';
import {
  READER_PREFERENCE_LIMITS,
  createDefaultReaderPreferences,
  normalizeReaderPreferences
} from '../../domain/readerPreferences';

describe('ReaderPreferences', () => {
  it('provides a complete safe default', () => {
    expect(createDefaultReaderPreferences()).toEqual({
      fontFamily: 'system',
      fontSize: 16,
      lineHeight: 1.6,
      letterSpacing: 0,
      paragraphSpacing: 0.75,
      textColor: '#1f2328',
      backgroundColor: '#ffffff',
      pagePadding: 24,
      textAlign: 'left',
      theme: 'system'
    });
  });

  it('clamps numeric values to centralized limits', () => {
    const preferences = normalizeReaderPreferences({
      fontSize: 200,
      lineHeight: 0,
      letterSpacing: 10,
      paragraphSpacing: -1,
      pagePadding: 999
    });

    expect(preferences).toMatchObject({
      fontSize: READER_PREFERENCE_LIMITS.fontSize.max,
      lineHeight: READER_PREFERENCE_LIMITS.lineHeight.min,
      letterSpacing: READER_PREFERENCE_LIMITS.letterSpacing.max,
      paragraphSpacing: READER_PREFERENCE_LIMITS.paragraphSpacing.min,
      pagePadding: READER_PREFERENCE_LIMITS.pagePadding.max
    });
  });

  it('keeps valid controlled values and restores unsafe fields to defaults', () => {
    expect(
      normalizeReaderPreferences({
        fontFamily: 'serif',
        fontSize: 'large',
        lineHeight: 1.8,
        letterSpacing: 0.02,
        paragraphSpacing: 1,
        textColor: 'url(https://example.com)',
        backgroundColor: '#abc',
        pagePadding: 32,
        textAlign: 'justify',
        theme: 'sepia'
      })
    ).toEqual({
      ...createDefaultReaderPreferences(),
      fontFamily: 'serif',
      lineHeight: 1.8,
      letterSpacing: 0.02,
      paragraphSpacing: 1,
      backgroundColor: '#aabbcc',
      pagePadding: 32,
      textAlign: 'justify',
      theme: 'sepia'
    });
  });

  it('recovers non-object and old partial state to defaults', () => {
    expect(normalizeReaderPreferences('damaged')).toEqual(createDefaultReaderPreferences());
    expect(normalizeReaderPreferences({ fontSize: 18 })).toEqual({
      ...createDefaultReaderPreferences(),
      fontSize: 18
    });
  });
});
