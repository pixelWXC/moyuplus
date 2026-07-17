import { describe, expect, it, vi } from 'vitest';
import { createDefaultReaderPreferences } from '../../domain/readerPreferences';
import { applyReaderPreferences } from '../../webview/readerPreferenceStyles';

function target(): HTMLElement {
  const style = {
    color: 'legacy-color',
    backgroundColor: 'legacy-background',
    setProperty: vi.fn(),
    removeProperty: vi.fn((name: string) => {
      if (name === 'color') style.color = '';
      if (name === 'background-color') style.backgroundColor = '';
    })
  };
  return { dataset: {}, style } as unknown as HTMLElement;
}

describe('reader preference styles', () => {
  it('removes inline colors when preferences inherit from the selected theme', () => {
    const element = target();

    applyReaderPreferences(element, createDefaultReaderPreferences());

    expect(element.style.removeProperty).toHaveBeenCalledWith('color');
    expect(element.style.removeProperty).toHaveBeenCalledWith('background-color');
    expect(element.style.color).toBe('');
    expect(element.style.backgroundColor).toBe('');
  });

  it('applies custom foreground and background colors inline', () => {
    const element = target();

    applyReaderPreferences(element, {
      ...createDefaultReaderPreferences(),
      textColor: '#112233',
      backgroundColor: '#ddeeff'
    });

    expect(element.style.color).toBe('#112233');
    expect(element.style.backgroundColor).toBe('#ddeeff');
  });
});
