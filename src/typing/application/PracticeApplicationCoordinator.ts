import type {
  CorrectPracticeCommand,
  FinishPracticeCommand,
  InputPracticeCommand,
  PausePracticeCommand,
  PreparePracticeCommand,
  RestartPracticeCommand,
  ResumePracticeCommand,
  StartPracticeCommand
} from './commands';
import type { PracticeApplicationEvent } from './events';
import type { PracticeApplicationPorts } from './ports';

export class PracticeApplicationCoordinator {
  constructor(private readonly ports: PracticeApplicationPorts) {}

  async prepare(command: PreparePracticeCommand): Promise<PracticeApplicationEvent> {
    const prepared = await this.ports.content.prepare(command.plan.contentRecipe, command.range);
    const snapshot = this.ports.snapshotBuilder.build({
      id: this.ports.ids.next('snapshot'),
      createdAt: this.ports.clock.wallNow(),
      plan: command.plan,
      prepared
    });
    await this.ports.snapshots.save(snapshot);
    return this.publish({ type: 'practicePrepared', snapshot });
  }

  async start(command: StartPracticeCommand): Promise<PracticeApplicationEvent> {
    const snapshot = await this.requireSnapshot(command.snapshotId);
    const sessionId = this.ports.ids.next('session');
    const lease = await this.ports.lease.acquire(sessionId);
    if (!lease.acquired) {
      return this.publish({
        type: 'practiceStartBlocked',
        activeSession: lease.activeSession
      });
    }
    let session: ReturnType<PracticeApplicationPorts['runtime']['start']>;
    try {
      session = this.ports.runtime.start({
        sessionId,
        attemptId: this.ports.ids.next('attempt'),
        snapshot,
        wallTime: this.ports.clock.wallNow(),
        monotonicTime: this.ports.clock.monotonicNow(),
        ...(command.targetIndex === undefined
          ? {}
          : { targetIndex: command.targetIndex })
      });
      await this.ports.sessions.save(session);
      await this.ports.panel.open(snapshot, session);
    } catch (error) {
      await this.ports.lease.release(sessionId);
      throw error;
    }
    return this.publish({ type: 'practiceStarted', session });
  }

  async pause(command: PausePracticeCommand): Promise<PracticeApplicationEvent> {
    const current = await this.requireSession(command.sessionId);
    const session = this.ports.runtime.pause(current, this.ports.clock.monotonicNow());
    await this.ports.sessions.save(session);
    await this.ports.panel.render(session);
    return this.publish({ type: 'practicePaused', session });
  }

  async resume(command: ResumePracticeCommand): Promise<PracticeApplicationEvent> {
    const current = await this.requireSession(command.sessionId);
    const session = this.ports.runtime.resume(current, this.ports.clock.monotonicNow());
    await this.ports.sessions.save(session);
    await this.ports.panel.render(session);
    return this.publish({ type: 'practiceResumed', session });
  }

  async restart(command: RestartPracticeCommand): Promise<PracticeApplicationEvent> {
    const current = await this.requireSession(command.sessionId);
    const snapshot = await this.requireSnapshot(current.snapshotId);
    const transition = this.ports.runtime.restart({
      session: current,
      snapshot,
      nextSessionId: this.ports.ids.next('session'),
      nextAttemptId: this.ports.ids.next('attempt'),
      resultId: this.ports.ids.next('result'),
      wallTime: this.ports.clock.wallNow(),
      monotonicTime: this.ports.clock.monotonicNow()
    });
    if (transition.result) {
      await this.ports.results.commit(transition.result);
    }
    await this.ports.sessions.save(transition.nextSession);
    await this.ports.panel.open(snapshot, transition.nextSession);
    await this.ports.lease.transition(
      transition.previousSession.id,
      transition.nextSession.id
    );
    return this.publish({
      type: 'practiceRestarted',
      previousSession: transition.previousSession,
      session: transition.nextSession,
      result: transition.result
    });
  }

  async input(command: InputPracticeCommand): Promise<PracticeApplicationEvent> {
    const current = await this.requireSession(command.sessionId);
    const snapshot = await this.requireSnapshot(current.snapshotId);
    const evaluated = this.ports.runtime.input({
      session: current,
      snapshot,
      text: command.text,
      origin: command.origin,
      wallTime: this.ports.clock.wallNow(),
      nextAttemptId: () => this.ports.ids.next('inputAttempt')
    });
    if (evaluated.status === 'completed') {
      const transition = this.ports.runtime.finish({
        session: evaluated,
        snapshot,
        resultId: this.ports.ids.next('result'),
        outcome: 'completed',
        wallTime: this.ports.clock.wallNow(),
        monotonicTime: this.ports.clock.monotonicNow()
      });
      await this.ports.sessions.save(transition.session);
      if (transition.result) {
        await this.ports.results.commit(transition.result);
      }
      await this.ports.panel.complete(transition.session, transition.result);
      await this.ports.lease.release(transition.session.id);
      return this.publish({
        type: 'practiceInputEvaluated',
        session: transition.session,
        result: transition.result
      });
    }
    await this.ports.sessions.save(evaluated);
    await this.ports.panel.render(evaluated);
    return this.publish({ type: 'practiceInputEvaluated', session: evaluated });
  }

  async correct(command: CorrectPracticeCommand): Promise<PracticeApplicationEvent> {
    const current = await this.requireSession(command.sessionId);
    const session = this.ports.runtime.correct({
      session: current,
      kind: command.kind,
      count: command.count,
      wallTime: this.ports.clock.wallNow()
    });
    await this.ports.sessions.save(session);
    await this.ports.panel.render(session);
    return this.publish({ type: 'practiceCorrectionApplied', session });
  }

  async finish(command: FinishPracticeCommand): Promise<PracticeApplicationEvent> {
    const current = await this.requireSession(command.sessionId);
    const snapshot = await this.requireSnapshot(current.snapshotId);
    const transition = this.ports.runtime.finish({
      session: current,
      snapshot,
      resultId: this.ports.ids.next('result'),
      outcome: command.outcome,
      wallTime: this.ports.clock.wallNow(),
      monotonicTime: this.ports.clock.monotonicNow()
    });
    await this.ports.sessions.save(transition.session);
    if (transition.result) {
      await this.ports.results.commit(transition.result);
    }
    await this.ports.panel.complete(transition.session, transition.result);
    await this.ports.lease.release(transition.session.id);
    return this.publish({
      type: 'practiceFinished',
      session: transition.session,
      result: transition.result
    });
  }

  private async requireSnapshot(snapshotId: string) {
    const snapshot = await this.ports.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Practice snapshot not found: ${snapshotId}`);
    }
    return snapshot;
  }

  private async requireSession(sessionId: string) {
    const session = await this.ports.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Practice session not found: ${sessionId}`);
    }
    return session;
  }

  private async publish<T extends PracticeApplicationEvent>(event: T): Promise<T> {
    await this.ports.events.publish(event);
    return event;
  }
}
