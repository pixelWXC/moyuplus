import type {
  PracticeSessionStatus
} from '../domain/session';
import type {
  ContentRecipe,
  PracticeSnapshot,
  SourceRange
} from '../domain/content';
import type { PracticePreferences } from '../domain/policies';
import type {
  PracticeSetupConfiguration
} from './PracticeSetupDraft';
import { PracticeSetupDraft } from './PracticeSetupDraft';
import type { PracticeApplicationCoordinator } from './PracticeApplicationCoordinator';

type ActivePracticeStatus = Extract<
  PracticeSessionStatus,
  'ready' | 'running' | 'blockedOnError' | 'paused'
>;

export interface TypingViewActivePracticeSession {
  id: string;
  status: ActivePracticeStatus;
}

export interface TypingViewActivePracticePort {
  current(): PromiseLike<TypingViewActivePracticeSession | undefined>;
  focus(sessionId: string): PromiseLike<void>;
}

export type TypingViewPracticeCoordinatorPort = Pick<
  PracticeApplicationCoordinator,
  'prepare' | 'start' | 'pause' | 'resume' | 'restart' | 'finish'
>;

export interface TypingViewPracticeCommandsOptions {
  draft: PracticeSetupDraft;
  coordinator: TypingViewPracticeCoordinatorPort;
  active: TypingViewActivePracticePort;
  preferences: {
    save(preferences: PracticePreferences): PromiseLike<void>;
  };
  continuations?: {
    get(
      recipe: ContentRecipe,
      range: SourceRange
    ): PromiseLike<{
      sourceRevision: string;
      targetIndex: number;
      totalUnits: number;
    } | undefined>;
  };
}

export type TypingViewConflictResolution =
  | 'returnCurrent'
  | 'finishAndStart'
  | 'cancel';

export type TypingViewPracticeDestination = 'setup' | 'live';
export type TypingViewLiveAction = 'pause' | 'resume' | 'restart' | 'finish';
export type TypingViewControlDestination = 'materials' | 'live' | 'result';

export interface TypingViewPracticeConflictSnapshot {
  sessionId: string;
  status: ActivePracticeStatus;
}

export class TypingViewPracticeCommands {
  private conflict?: TypingViewActivePracticeSession;

  constructor(private readonly options: TypingViewPracticeCommandsOptions) {}

  async startPractice(
    configuration: PracticeSetupConfiguration
  ): Promise<TypingViewPracticeDestination> {
    this.options.draft.configure(configuration);
    const active = await this.options.active.current();
    if (active) {
      this.conflict = structuredClone(active);
      return 'setup';
    }
    this.conflict = undefined;
    return this.startConfiguredDraft();
  }

  conflictSnapshot(): TypingViewPracticeConflictSnapshot | undefined {
    return this.conflict
      ? {
        sessionId: this.conflict.id,
        status: this.conflict.status
      }
      : undefined;
  }

  async saveSetupAsDefault(
    configuration: PracticeSetupConfiguration
  ): Promise<void> {
    this.options.draft.configure(configuration);
    const plan = this.options.draft.snapshot()?.plan;
    if (!plan) {
      throw new Error('Practice setup must be configured before saving defaults.');
    }
    await this.options.preferences.save({
      schemaVersion: 1,
      evaluation: structuredClone(plan.evaluation),
      textPolicy: structuredClone(plan.textPolicy),
      flowPolicy: structuredClone(plan.flowPolicy),
      displayPolicy: structuredClone(plan.displayPolicy)
    });
  }

  async resolveSessionConflict(
    resolution: TypingViewConflictResolution
  ): Promise<TypingViewPracticeDestination> {
    const conflict = this.conflict;
    if (!conflict) return 'setup';
    if (resolution === 'cancel') {
      this.conflict = undefined;
      return 'setup';
    }
    const active = await this.options.active.current();
    if (!active) {
      this.conflict = undefined;
      return this.startConfiguredDraft();
    }
    if (active.id !== conflict.id) {
      this.conflict = structuredClone(active);
      return 'setup';
    }
    if (resolution === 'returnCurrent') {
      await this.options.active.focus(active.id);
      this.conflict = undefined;
      return 'live';
    }
    await this.options.coordinator.finish({
      type: 'finish',
      sessionId: active.id,
      outcome: 'abandoned'
    });
    this.conflict = undefined;
    return this.startConfiguredDraft();
  }

  async controlPractice(
    action: TypingViewLiveAction
  ): Promise<TypingViewControlDestination> {
    const active = await this.options.active.current();
    if (!active) return 'materials';
    if (action === 'pause') {
      if (active.status === 'running' || active.status === 'blockedOnError') {
        await this.options.coordinator.pause({
          type: 'pause',
          sessionId: active.id
        });
      }
      return 'live';
    }
    if (action === 'resume') {
      if (active.status === 'paused') {
        await this.options.coordinator.resume({
          type: 'resume',
          sessionId: active.id
        });
      }
      return 'live';
    }
    if (action === 'restart') {
      await this.options.coordinator.restart({
        type: 'restart',
        sessionId: active.id
      });
      return 'live';
    }
    await this.options.coordinator.finish({
      type: 'finish',
      sessionId: active.id,
      outcome: 'abandoned'
    });
    return 'result';
  }

  private async startConfiguredDraft(): Promise<TypingViewPracticeDestination> {
    const draft = this.options.draft.snapshot();
    if (!draft?.plan || !draft.selectedRange) {
      throw new Error('Practice setup must be configured before starting.');
    }
    const prepared = await this.options.coordinator.prepare({
      type: 'prepare',
      plan: draft.plan,
      range: draft.selectedRange
    });
    if (prepared.type !== 'practicePrepared') {
      throw new Error('Practice prepare command returned an unexpected event.');
    }
    const targetIndex = await this.resolveStartTarget(
      draft,
      prepared.snapshot
    );
    const started = await this.options.coordinator.start({
      type: 'start',
      snapshotId: prepared.snapshot.id,
      ...(targetIndex > 0 ? { targetIndex } : {})
    });
    if (started.type === 'practiceStartBlocked') {
      this.conflict = structuredClone(started.activeSession);
      return 'setup';
    }
    return 'live';
  }

  private async resolveStartTarget(
    draft: NonNullable<ReturnType<PracticeSetupDraft['snapshot']>>,
    snapshot: PracticeSnapshot
  ): Promise<number> {
    const position = draft.startPosition ?? { kind: 'beginning' };
    if (position.kind === 'beginning') return 0;
    if (position.kind === 'percentage') {
      const percent = Math.max(0, Math.min(99, Math.trunc(position.percent)));
      const approximate = Math.floor(
        snapshot.targetUnits.length * percent / 100
      );
      return printableTargetAt(snapshot, approximate);
    }
    const continuation = await this.options.continuations?.get(
      draft.contentRecipe,
      draft.selectedRange!
    );
    if (
      !continuation
      || continuation.sourceRevision !== snapshot.sourceRevision
      || continuation.targetIndex <= 0
      || continuation.targetIndex >= snapshot.targetUnits.length
    ) {
      return 0;
    }
    return continuation.targetIndex;
  }
}

function printableTargetAt(
  snapshot: PracticeSnapshot,
  targetIndex: number
): number {
  let clamped = Math.max(
    0,
    Math.min(snapshot.targetUnits.length - 1, targetIndex)
  );
  while (
    clamped < snapshot.targetUnits.length - 1
    && snapshot.targetUnits[clamped]?.kind !== 'grapheme'
  ) {
    clamped += 1;
  }
  return clamped;
}
