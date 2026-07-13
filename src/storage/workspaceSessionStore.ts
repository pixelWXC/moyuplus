import { type TypingPracticeSession, createDefaultTypingPracticeSession, normalizeTypingPracticeSession } from '../domain/models';
import { type StateMemento } from './memento';
import { TYPING_PRACTICE_SESSION_KEY } from './storageKeys';

export class WorkspaceSessionStore {
  constructor(private readonly workspaceState: StateMemento) {}

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
