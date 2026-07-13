import { describe, expect, it } from 'vitest';
import {
  createDefaultShortcutConfig,
  createDefaultTypingPracticeSession,
  type TypingPracticeSession
} from '../../domain/models';
import { WorkspaceSessionStore } from '../../storage/workspaceSessionStore';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();
  constructor(initial: Record<string, unknown> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
  }
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

describe('workspace typing session storage', () => {
  it('creates safe typing and shortcut defaults', () => {
    expect(createDefaultTypingPracticeSession()).toMatchObject({
      active: false,
      lineIndex: 0,
      totalLines: 0,
      tabMode: 'completeRest'
    });
    expect(createDefaultShortcutConfig()).toEqual({});
  });

  it('saves and resets the typing session without a legacy Reader session API', async () => {
    const store = new WorkspaceSessionStore(new MemoryMemento());
    const session: TypingPracticeSession = {
      ...createDefaultTypingPracticeSession(),
      active: true,
      fileId: 'txt-1',
      lineIndex: 4,
      totalLines: 20
    };

    await store.saveTypingPracticeSession(session);
    expect(store.getTypingPracticeSession()).toEqual(session);
    expect(await store.resetTypingPracticeSession()).toEqual(createDefaultTypingPracticeSession());
  });

  it('normalizes damaged persisted typing state', () => {
    const store = new WorkspaceSessionStore(new MemoryMemento({
      'moyuplus.typingPracticeSession.v1': { active: true, lineIndex: -2, totalLines: Number.NaN }
    }));
    expect(store.getTypingPracticeSession()).toEqual({
      ...createDefaultTypingPracticeSession(),
      active: true
    });
  });
});
