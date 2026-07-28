import type { ReadingLocator } from '../../../domain/locators';
import type { PracticeSetupDraft } from '../../application';

export interface TypingEntryPoint {
  openFromBook(
    bookId: string,
    suggestedLocator?: ReadingLocator
  ): Promise<void>;
}

export interface TypingSetupViewPort {
  openSetup(): PromiseLike<void>;
}

export interface ReaderTypingSourceRecoveryPort {
  isAvailable(bookId: string): PromiseLike<boolean>;
  reportUnavailable(bookId: string): PromiseLike<void>;
  requestRelocation(bookId: string): PromiseLike<void>;
}

export class ReaderTypingEntryPoint implements TypingEntryPoint {
  constructor(
    private readonly draft: Pick<PracticeSetupDraft, 'selectContent'>,
    private readonly view: TypingSetupViewPort,
    private readonly recovery?: ReaderTypingSourceRecoveryPort
  ) {}

  async openFromBook(
    bookId: string,
    suggestedLocator?: ReadingLocator
  ): Promise<void> {
    if (bookId.trim().length === 0) {
      throw new Error('Reader typing entry requires a book id.');
    }
    if (this.recovery && !await this.recovery.isAvailable(bookId)) {
      await this.recovery.reportUnavailable(bookId);
      await this.recovery.requestRelocation(bookId);
      return;
    }
    const suggestedSectionId = suggestedLocator?.sectionId;
    this.draft.selectContent(
      {
        kind: 'readerBook',
        bookId,
        ...(suggestedSectionId ? { suggestedSectionId } : {})
      },
      suggestedSectionId
        ? { kind: 'chapter', chapterId: suggestedSectionId }
        : undefined
    );
    await this.view.openSetup();
  }
}
