import { describe, expect, it } from 'vitest';
import {
  createDefaultImmersiveReaderPreferences,
  normalizeImmersiveReaderPreferences
} from '../../domain/immersiveReaderPreferences';

describe('ImmersiveReaderPreferences', () => {
  it('provides the approved independent defaults', () => {
    expect(createDefaultImmersiveReaderPreferences()).toEqual({
      visualLines: 3,
      graphemesPerLine: 40,
      textColor: 'theme',
      backgroundColor: 'transparent',
      fontWeight: 'normal',
      italic: false,
      leftMargin: 12
    });
  });

  it('normalizes ranges and rejects unsafe style values', () => {
    expect(normalizeImmersiveReaderPreferences({
      visualLines: 99,
      graphemesPerLine: 2,
      textColor: '#AAbbCC',
      backgroundColor: 'url(https://example.com)',
      fontWeight: '900',
      italic: true,
      leftMargin: -8
    })).toEqual({
      visualLines: 12,
      graphemesPerLine: 8,
      textColor: '#aabbcc',
      backgroundColor: 'transparent',
      fontWeight: 'normal',
      italic: true,
      leftMargin: 0
    });
  });
});
