import { describe, expect, it, vi } from 'vitest';
import { GitLogModeCoordinator, type GitLogCoordinatorReader, type GitLogCoordinatorView } from '../../git/gitLogModeCoordinator';
import { GitLogModeStore } from '../../storage/gitLogModeStore';

class MemoryMemento {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

const position = {
  bookId: 'book-1', locator: { kind: 'txt' as const, sectionId: 's1', progression: 0.6, offset: 60 },
  bookProgression: 0.5, updatedAt: 10
};

function setup(initial: Record<string, unknown> = {}) {
  const memento = new MemoryMemento();
  for (const [key, value] of Object.entries(initial)) memento.values.set(key, value);
  const store = new GitLogModeStore(memento);
  let visible = true;
  const reader: GitLogCoordinatorReader = {
    capturePosition: vi.fn(() => position),
    flush: vi.fn(async () => undefined),
    restore: vi.fn(async () => true)
  };
  const view: GitLogCoordinatorView = {
    isVisible: () => visible,
    focus: vi.fn(async () => { visible = true; }),
    openGitSession: vi.fn(async () => undefined),
    detachGitSession: vi.fn(),
    showLibrary: vi.fn(async () => undefined),
    showError: vi.fn(async () => undefined)
  };
  const coordinator = new GitLogModeCoordinator(store, reader, view, {
    createSessionId: (() => { let id = 0; return () => `git-${++id}`; })(),
    flushTimeoutMs: 20
  });
  return { coordinator, store, reader, view, setVisible: (value: boolean) => { visible = value; } };
}

describe('GitLogModeCoordinator', () => {
  it('persists active with a minimal resume target before showing Git loading', async () => {
    const { coordinator, store, reader, view } = setup();
    await coordinator.toggle();
    expect(store.get()).toMatchObject({ active: true, resumeTarget: { bookId: 'book-1', bookProgression: 0.5 } });
    expect(reader.flush).toHaveBeenCalledOnce();
    expect(view.openGitSession).toHaveBeenCalledWith('git-1');
  });

  it('focuses an absent view on entry but leaves a hidden view closed on exit', async () => {
    const target = setup();
    target.setVisible(false);
    await target.coordinator.toggle();
    expect(target.view.focus).toHaveBeenCalledOnce();
    target.setVisible(false);
    await target.coordinator.toggle();
    expect(target.store.get()).toMatchObject({ active: false, resumeTarget: expect.any(Object) });
    expect(target.reader.restore).not.toHaveBeenCalled();
  });

  it('claims the resume target before restoring and never restores twice', async () => {
    const target = setup();
    await target.coordinator.toggle();
    await target.coordinator.toggle();
    expect(target.reader.restore).toHaveBeenCalledOnce();
    expect(target.store.get()).toEqual({ active: false });
    await target.coordinator.bootstrap();
    expect(target.reader.restore).toHaveBeenCalledOnce();
  });

  it('coalesces a rapid double toggle to the original inactive mode', async () => {
    const target = setup();
    await Promise.all([target.coordinator.toggle(), target.coordinator.toggle()]);
    expect(target.store.get().active).toBe(false);
    expect(target.reader.restore).toHaveBeenCalledOnce();
  });

  it('cancels the current Git session when hidden and starts fresh when revealed', async () => {
    const target = setup();
    await target.coordinator.toggle();
    target.setVisible(false);
    await target.coordinator.visibilityChanged();
    expect(target.view.detachGitSession).toHaveBeenCalledWith('git-1');
    target.setVisible(true);
    await target.coordinator.visibilityChanged();
    expect(target.view.openGitSession).toHaveBeenLastCalledWith('git-2');
  });

  it('does not keep a session alive when atomic opening finishes after hide', async () => {
    let release!: () => void;
    const opened = new Promise<void>(resolve => { release = resolve; });
    const target = setup();
    vi.mocked(target.view.openGitSession).mockReturnValueOnce(opened);

    const entering = target.coordinator.toggle();
    await vi.waitFor(() => expect(target.view.openGitSession).toHaveBeenCalledWith('git-1'));
    target.setVisible(false);
    await target.coordinator.visibilityChanged();
    release();
    await entering;

    expect(target.view.detachGitSession).toHaveBeenCalledWith('git-1');
  });
});
