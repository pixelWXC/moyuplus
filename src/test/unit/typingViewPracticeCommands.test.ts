import { describe, expect, it, vi } from 'vitest';
import {
  PracticeSetupDraft,
  TypingViewPracticeCommands
} from '../../typing';

const setup = {
  selectedRange: {
    kind: 'whole'
  },
  plan: {
    completion: {
      kind: 'free'
    },
    evaluation: {
      errorPolicy: 'block'
    },
    textPolicy: {
      punctuation: {
        mode: 'strict',
        mappingVersion: 'strict-v1'
      },
      whitespace: {
        mode: 'trimLineEdges'
      },
      caseSensitive: true
    },
    flowPolicy: {
      lineAdvance: 'automatic',
      presentation: 'continuous'
    },
    displayPolicy: {
      showLiveMetrics: true,
      showWhitespace: false
    }
  }
} as const;

function createHarness(activeSession: {
  id: string;
  status: 'running' | 'blockedOnError' | 'paused';
} | undefined = undefined) {
  const draft = new PracticeSetupDraft();
  draft.selectContent({
    kind: 'adHoc',
    text: '今天开始新的练习。',
    contentProfile: {
      kind: 'chinese',
      category: 'adHoc'
    }
  });
  const coordinator = {
    prepare: vi.fn(async () => ({
      type: 'practicePrepared' as const,
      snapshot: { id: 'snapshot-1' }
    })),
    start: vi.fn(async () => ({
      type: 'practiceStarted' as const,
      session: { id: 'session-new', status: 'running' }
    })),
    finish: vi.fn(async () => ({
      type: 'practiceFinished' as const,
      session: { id: activeSession?.id ?? 'session-old', status: 'abandoned' }
    })),
    pause: vi.fn(async () => ({
      type: 'practicePaused' as const,
      session: { id: activeSession?.id ?? 'session-old', status: 'paused' }
    })),
    resume: vi.fn(async () => ({
      type: 'practiceResumed' as const,
      session: { id: activeSession?.id ?? 'session-old', status: 'running' }
    })),
    restart: vi.fn(async () => ({
      type: 'practiceRestarted' as const,
      previousSession: { id: activeSession?.id ?? 'session-old', status: 'abandoned' },
      session: { id: 'session-restarted', status: 'running' }
    }))
  };
  const active = {
    current: vi.fn(async () => activeSession),
    focus: vi.fn(async () => undefined)
  };
  const preferences = {
    save: vi.fn(async () => undefined)
  };
  return {
    draft,
    coordinator,
    active,
    preferences,
    commands: new TypingViewPracticeCommands({
      draft,
      coordinator,
      active,
      preferences
    })
  };
}

describe('TypingViewPracticeCommands', () => {
  it('configures the draft, prepares an immutable snapshot and starts it', async () => {
    const harness = createHarness();

    await expect(harness.commands.startPractice(setup)).resolves.toBe('live');

    expect(harness.coordinator.prepare).toHaveBeenCalledWith({
      type: 'prepare',
      range: { kind: 'whole' },
      plan: {
        contentRecipe: harness.draft.snapshot()?.contentRecipe,
        ...setup.plan
      }
    });
    expect(harness.coordinator.start).toHaveBeenCalledWith({
      type: 'start',
      snapshotId: 'snapshot-1'
    });
    expect(harness.commands.conflictSnapshot()).toBeUndefined();
    expect(harness.preferences.save).not.toHaveBeenCalled();
  });

  it('persists policy defaults only through the explicit setup action', async () => {
    const harness = createHarness();

    await expect(
      harness.commands.saveSetupAsDefault(setup)
    ).resolves.toBeUndefined();

    expect(harness.preferences.save).toHaveBeenCalledWith({
      schemaVersion: 1,
      evaluation: setup.plan.evaluation,
      textPolicy: setup.plan.textPolicy,
      flowPolicy: setup.plan.flowPolicy,
      displayPolicy: setup.plan.displayPolicy
    });
    expect(harness.coordinator.prepare).not.toHaveBeenCalled();
    expect(harness.coordinator.start).not.toHaveBeenCalled();
    expect(harness.draft.snapshot()?.selectedRange).toEqual({ kind: 'whole' });
  });

  it('does not replace an active session until the user resolves the conflict', async () => {
    const harness = createHarness({
      id: 'session-current',
      status: 'paused'
    });

    await expect(harness.commands.startPractice(setup)).resolves.toBe('setup');

    expect(harness.coordinator.prepare).not.toHaveBeenCalled();
    expect(harness.commands.conflictSnapshot()).toEqual({
      sessionId: 'session-current',
      status: 'paused'
    });

    await expect(
      harness.commands.resolveSessionConflict('cancel')
    ).resolves.toBe('setup');
    expect(harness.commands.conflictSnapshot()).toBeUndefined();
    expect(harness.coordinator.finish).not.toHaveBeenCalled();
  });

  it('surfaces an atomic lease conflict discovered after the local preflight', async () => {
    const harness = createHarness();
    harness.coordinator.start.mockResolvedValueOnce({
      type: 'practiceStartBlocked',
      activeSession: {
        id: 'session-other-window',
        status: 'running'
      }
    });

    await expect(harness.commands.startPractice(setup)).resolves.toBe('setup');

    expect(harness.commands.conflictSnapshot()).toEqual({
      sessionId: 'session-other-window',
      status: 'running'
    });
  });

  it('can return to the active session without changing it', async () => {
    const harness = createHarness({
      id: 'session-current',
      status: 'running'
    });
    await harness.commands.startPractice(setup);

    await expect(
      harness.commands.resolveSessionConflict('returnCurrent')
    ).resolves.toBe('live');

    expect(harness.active.focus).toHaveBeenCalledWith('session-current');
    expect(harness.coordinator.finish).not.toHaveBeenCalled();
    expect(harness.coordinator.prepare).not.toHaveBeenCalled();
  });

  it('abandons the current session before creating the requested replacement', async () => {
    const harness = createHarness({
      id: 'session-current',
      status: 'blockedOnError'
    });
    await harness.commands.startPractice(setup);

    await expect(
      harness.commands.resolveSessionConflict('finishAndStart')
    ).resolves.toBe('live');

    expect(harness.coordinator.finish).toHaveBeenCalledWith({
      type: 'finish',
      sessionId: 'session-current',
      outcome: 'abandoned'
    });
    expect(harness.coordinator.prepare).toHaveBeenCalledTimes(1);
    expect(harness.coordinator.start).toHaveBeenCalledTimes(1);
    expect(harness.coordinator.finish.mock.invocationCallOrder[0])
      .toBeLessThan(harness.coordinator.prepare.mock.invocationCallOrder[0]!);
  });

  it('routes live controls against the authoritative active session', async () => {
    const running = createHarness({
      id: 'session-current',
      status: 'running'
    });
    await expect(running.commands.controlPractice('pause')).resolves.toBe('live');
    expect(running.coordinator.pause).toHaveBeenCalledWith({
      type: 'pause',
      sessionId: 'session-current'
    });
    await expect(running.commands.controlPractice('restart')).resolves.toBe('live');
    expect(running.coordinator.restart).toHaveBeenCalledWith({
      type: 'restart',
      sessionId: 'session-current'
    });
    await expect(running.commands.controlPractice('finish')).resolves.toBe('result');
    expect(running.coordinator.finish).toHaveBeenCalledWith({
      type: 'finish',
      sessionId: 'session-current',
      outcome: 'abandoned'
    });

    const paused = createHarness({
      id: 'session-paused',
      status: 'paused'
    });
    await expect(paused.commands.controlPractice('resume')).resolves.toBe('live');
    expect(paused.coordinator.resume).toHaveBeenCalledWith({
      type: 'resume',
      sessionId: 'session-paused'
    });
  });

  it('does not execute live controls when no active session exists', async () => {
    const harness = createHarness();

    await expect(harness.commands.controlPractice('finish')).resolves.toBe('materials');

    expect(harness.coordinator.finish).not.toHaveBeenCalled();
    expect(harness.coordinator.pause).not.toHaveBeenCalled();
    expect(harness.coordinator.restart).not.toHaveBeenCalled();
  });
});
