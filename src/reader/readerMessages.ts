import { type ImportedTxtFile, type PageRange, type ReaderSession, type ReaderViewportSnapshot } from '../domain/models';

export const READER_VIEW_ID = 'moyuplus.readerView';

export type ReaderViewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'selectFile'; fileId: string }
  | { type: 'pageRendered'; range: PageRange; viewportSnapshot?: ReaderViewportSnapshot }
  | { type: 'nextPage'; currentRange: PageRange; viewportSnapshot?: ReaderViewportSnapshot }
  | { type: 'previousPage' }
  | { type: 'setFontSize'; fontSize: number }
  | { type: 'openShortcutSettings' };

export interface ReaderStatePayload {
  files: ImportedTxtFile[];
  session: ReaderSession;
  activeFile?: ImportedTxtFile;
  text?: string;
  error?: string;
}

export type ExtensionToReaderMessage =
  | { type: 'state'; payload: ReaderStatePayload }
  | { type: 'error'; message: string }
  | { type: 'command'; command: 'nextPage' };
