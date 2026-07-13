import type { ReaderPreferences } from '../domain/readerPreferences';

export function applyReaderPreferences(target: HTMLElement, preferences: ReaderPreferences): void {
  target.dataset.theme = preferences.theme;
  Object.assign(target.style, {
    fontFamily: preferences.fontFamily === 'serif'
      ? 'Georgia, serif'
      : preferences.fontFamily === 'sans-serif' ? 'Segoe UI, sans-serif' : 'var(--vscode-font-family)',
    fontSize: `${preferences.fontSize}px`,
    lineHeight: String(preferences.lineHeight),
    letterSpacing: `${preferences.letterSpacing}em`,
    padding: `${preferences.pagePadding}px`,
    textAlign: preferences.textAlign
  });
  target.style.setProperty('--paragraph-spacing', `${preferences.paragraphSpacing}em`);
}
