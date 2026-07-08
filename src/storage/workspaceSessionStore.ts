import {
  type ReaderSession,
  type TypingPracticeSession,
  createDefaultReaderSession,
  createDefaultTypingPracticeSession,
  normalizeReaderSession,
  normalizeTypingPracticeSession
} from '../domain/models';
import { type StateMemento } from './memento';
import { READER_SESSION_KEY, TYPING_PRACTICE_SESSION_KEY } from './storageKeys';

export class WorkspaceSessionStore {
  constructor(private readonly workspaceState: StateMemento) {}

  getReaderSession(): ReaderSession {
    return normalizeReaderSession(this.workspaceState.get<unknown>(READER_SESSION_KEY));
  }

  async saveReaderSession(session: ReaderSession): Promise<ReaderSession> {
    const normalizedSession = normalizeReaderSession(session);
    await this.workspaceState.update(READER_SESSION_KEY, normalizedSession);
    return normalizedSession;
  }

  async resetReaderSession(): Promise<ReaderSession> {
    const session = createDefaultReaderSession();
    await this.workspaceState.update(READER_SESSION_KEY, session);
    return session;
  }

  getTypingPracticeSession(): TypingPracticeSession {
    return normalizeTypingPracticeSession(this.workspaceState.get<unknown>(TYPING_PRACTICE_SESSION_KEY));
  }

  async saveTypingPracticeSession(session: TypingPracticeSession): Promise<TypingPracticeSession> {
    const normalizedSession = normalizeTypingPracticeSession(session);
    await this.workspaceState.update(TYPING_PRACTICE_SESSION_KEY, normalizedSession);
    return normalizedSession;
  }

  async resetTypingPracticeSession(): Promise<TypingPracticeSession> {
    const session = createDefaultTypingPracticeSession();
    await this.workspaceState.update(TYPING_PRACTICE_SESSION_KEY, session);
    return session;
  }
}
