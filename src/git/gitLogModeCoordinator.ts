import type { ReadingPosition } from '../domain/locators';
import { GitLogModeStore, type GitLogResumeTarget } from '../storage/gitLogModeStore';

export const TOGGLE_GIT_LOG_COMMAND_ID = 'moyuplus.gitLog.toggle';

export interface GitLogCoordinatorReader {
  capturePosition(): ReadingPosition | undefined;
  flush(): Promise<void>;
  restore(target: GitLogResumeTarget): Promise<boolean>;
}

export interface GitLogCoordinatorView {
  isVisible(): boolean;
  focus(): Promise<void>;
  showGitLoading(sessionId: string): Promise<void>;
  showLibrary(message?: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export interface GitLogCoordinatorSessions {
  start(sessionId: string): void;
  cancel(): void;
}

export interface GitLogModeCoordinatorOptions {
  createSessionId?: () => string;
  flushTimeoutMs?: number;
}

export class GitLogModeCoordinator {
  private desiredActive?: boolean;
  private drainPromise?: Promise<void>;
  private pendingFlush?: Promise<void>;
  private currentSessionId?: string;
  private sessionSequence = 0;
  private readonly createSessionId: () => string;
  private readonly flushTimeoutMs: number;

  constructor(
    private readonly store: GitLogModeStore,
    private readonly reader: GitLogCoordinatorReader,
    private readonly view: GitLogCoordinatorView,
    private readonly sessions: GitLogCoordinatorSessions,
    options: GitLogModeCoordinatorOptions = {}
  ) {
    this.createSessionId = options.createSessionId ?? (() => `git-log-${Date.now()}-${++this.sessionSequence}`);
    this.flushTimeoutMs = options.flushTimeoutMs ?? 1_500;
  }

  toggle(): Promise<void> {
    this.desiredActive ??= this.store.get().active;
    this.desiredActive = !this.desiredActive;
    if (!this.drainPromise) {
      this.drainPromise = this.drain().finally(() => {
        this.desiredActive = this.store.get().active;
        this.drainPromise = undefined;
      });
    }
    return this.drainPromise;
  }

  async bootstrap(): Promise<void> {
    if (!this.view.isVisible()) return;
    if (this.store.get().active) {
      await this.beginGitSession();
      return;
    }
    await this.restorePendingTarget();
  }

  async visibilityChanged(): Promise<void> {
    if (!this.view.isVisible()) {
      this.cancelSession();
      return;
    }
    await this.bootstrap();
  }

  dispose(): void {
    this.cancelSession();
  }

  private async drain(): Promise<void> {
    while (this.store.get().active !== this.desiredActive) {
      try {
        if (this.desiredActive) await this.enter();
        else await this.exit();
      } catch {
        this.desiredActive = this.store.get().active;
        await this.view.showError(this.desiredActive
          ? '无法退出 Git Log，请稍后重试。'
          : '无法进入 Git Log，请稍后重试。');
      }
    }
  }

  private async enter(): Promise<void> {
    const current = this.store.get();
    const position = this.reader.capturePosition();
    const resumeTarget = position ? toResumeTarget(position) : current.resumeTarget;
    await this.store.save({ active: true, ...(resumeTarget ? { resumeTarget } : {}) });
    this.pendingFlush = this.reader.flush().catch(() => undefined);
    if (!this.view.isVisible()) {
      try { await this.view.focus(); }
      catch {
        await this.view.showError('Git Log 已启用，但无法自动显示 MoyuPlus Reader。');
        return;
      }
    }
    if (this.view.isVisible() && !this.currentSessionId) await this.beginGitSession();
  }

  private async exit(): Promise<void> {
    const current = this.store.get();
    await this.store.save({ active: false, ...(current.resumeTarget ? { resumeTarget: current.resumeTarget } : {}) });
    this.cancelSession();
    await this.waitForPendingFlush();
    if (this.view.isVisible()) await this.restorePendingTarget();
  }

  private async beginGitSession(): Promise<void> {
    this.cancelSession();
    const sessionId = this.createSessionId();
    this.currentSessionId = sessionId;
    await this.view.showGitLoading(sessionId);
    this.sessions.start(sessionId);
  }

  private cancelSession(): void {
    if (!this.currentSessionId) return;
    this.currentSessionId = undefined;
    this.sessions.cancel();
  }

  private async restorePendingTarget(): Promise<void> {
    const current = this.store.get();
    if (current.active) return;
    if (!current.resumeTarget) {
      await this.view.showLibrary();
      return;
    }
    let target: GitLogResumeTarget;
    try { target = (await this.store.claimResumeTarget()) as GitLogResumeTarget; }
    catch {
      await this.view.showLibrary('无法恢复上次阅读位置，请稍后重新打开 Reader。');
      return;
    }
    const restored = await this.reader.restore(target).catch(() => false);
    if (!restored) await this.view.showLibrary('无法恢复上次阅读内容，已返回书架。');
  }

  private async waitForPendingFlush(): Promise<void> {
    const pending = this.pendingFlush;
    this.pendingFlush = undefined;
    if (!pending) return;
    await Promise.race([
      pending,
      new Promise<void>(resolve => setTimeout(resolve, this.flushTimeoutMs))
    ]);
  }
}

function toResumeTarget(position: ReadingPosition): GitLogResumeTarget {
  return {
    bookId: position.bookId,
    locator: { ...position.locator },
    bookProgression: position.bookProgression
  };
}
