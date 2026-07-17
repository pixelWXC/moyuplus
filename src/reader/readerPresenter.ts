import type { BookFormat } from '../domain/books';
import type { SafeSectionDocument, SectionRef } from '../adapters/bookAdapter';
import type { ImmersiveReaderPreferences } from '../domain/immersiveReaderPreferences';

export type ReaderPresentationMode = 'webview' | 'immersive';
export type PresenterPageMove = 'moved' | 'start' | 'end' | 'unavailable';

export interface ReaderPresenterActivation {
  bookId: string;
  format: BookFormat;
  sections: readonly SectionRef[];
  section: SafeSectionDocument;
  localOffset: number;
}

export interface PresentedPosition {
  sectionId: string;
  localOffset: number;
}

export interface ImmersiveReaderPresenter {
  readonly mode: 'immersive';
  activate(snapshot: ReaderPresenterActivation): Promise<void>;
  showSection(section: SafeSectionDocument, localOffset: number): Promise<void>;
  nextPage(): Promise<PresenterPageMove>;
  previousPage(): Promise<PresenterPageMove>;
  capturePosition(): PresentedPosition | undefined;
  suspend(): void;
  resume(): void;
  applyPreferences(preferences: ImmersiveReaderPreferences): void;
  dispose(): Promise<void>;
}
