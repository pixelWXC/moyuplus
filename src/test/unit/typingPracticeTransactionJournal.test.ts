import { appendFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PracticeSessionEngine,
  PracticeTransactionEngine,
  buildPracticeSnapshot,
  createDefaultPracticePlan,
  preparePracticeContent
} from '../../typing';
import {
  PracticeTransactionJournalStore
} from '../../typing/adapters/storage';

const roots: string[] = [];

describe('PracticeTransactionJournalStore', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(roots.splice(0).map(root =>
      rm(root, { recursive: true, force: true })
    ));
  });

  it('appends durable deltas and recovers them in revision order', async () => {
    const root = await temporaryRoot();
    const { session, deltas } = createDeltas();
    const store = new PracticeTransactionJournalStore(root);

    await store.append(session.id, deltas[0]);
    await store.append(session.id, deltas[1]);

    await expect(store.recover(session.id, 0)).resolves.toEqual(deltas);
    await expect(store.findReceipt(session.id, 'transaction-2'))
      .resolves.toEqual(deltas[1]?.receipt);
  });

  it('does not append a duplicate transaction id twice', async () => {
    const root = await temporaryRoot();
    const { session, deltas } = createDeltas();
    const store = new PracticeTransactionJournalStore(root);

    await expect(store.append(session.id, deltas[0])).resolves.toBe('appended');
    await expect(store.append(session.id, deltas[0])).resolves.toBe('duplicate');
    await expect(store.recover(session.id, 0)).resolves.toHaveLength(1);
  });

  it('ignores only an incomplete tail in the final segment', async () => {
    const root = await temporaryRoot();
    const { session, deltas } = createDeltas();
    const store = new PracticeTransactionJournalStore(root);
    await store.append(session.id, deltas[0]);
    const segment = path.join(
      root,
      'typing',
      'sessions',
      session.id,
      'journal',
      'segment-000001.jsonl'
    );
    await appendFile(segment, '{"schemaVersion":1,"payload":', 'utf8');

    await expect(store.recover(session.id, 0)).resolves.toEqual([deltas[0]]);
  });

  it('replays only revisions newer than the checkpoint and compacts covered segments', async () => {
    const root = await temporaryRoot();
    const { session, deltas } = createDeltas();
    const store = new PracticeTransactionJournalStore(root, {
      recordsPerSegment: 1
    });
    await store.append(session.id, deltas[0]);
    await store.append(session.id, deltas[1]);

    await expect(store.recover(session.id, 1)).resolves.toEqual([deltas[1]]);
    await store.compact(session.id, 1);
    await expect(store.recover(session.id, 1)).resolves.toEqual([deltas[1]]);
  });

  it('rejects a checksum mismatch or a revision gap instead of guessing', async () => {
    const root = await temporaryRoot();
    const { session, deltas } = createDeltas();
    const store = new PracticeTransactionJournalStore(root);
    await store.append(session.id, deltas[0]);
    const segment = path.join(
      root,
      'typing',
      'sessions',
      session.id,
      'journal',
      'segment-000001.jsonl'
    );
    await writeFile(segment, `${JSON.stringify({
      schemaVersion: 1,
      payload: {
        sessionId: session.id,
        revision: 2,
        transactionId: 'forged',
        delta: deltas[1]
      },
      checksum: 'forged'
    })}\n`, 'utf8');

    await expect(store.recover(session.id, 0)).rejects.toThrow(
      'Practice transaction journal checksum is invalid.'
    );
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-journal-'));
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

function createDeltas() {
  const contentProfile = { kind: 'english', category: 'adHoc' } as const;
  const snapshot = buildPracticeSnapshot({
    id: 'snapshot-journal',
    createdAt: 1,
    plan: createDefaultPracticePlan({
      contentRecipe: { kind: 'adHoc', text: 'ab' },
      contentProfile
    }),
    prepared: preparePracticeContent('ab', {
      sourceRevision: 'source-1',
      contentProfile,
      range: { kind: 'whole' }
    })
  });
  const session = new PracticeSessionEngine().start({
    sessionId: 'session-journal',
    attemptId: 'attempt-journal',
    snapshot,
    wallTime: 1,
    monotonicTime: 1
  });
  const engine = new PracticeTransactionEngine();
  let attempt = 0;
  const first = engine.calculate({
    session,
    snapshot,
    transaction: {
      type: 'submit',
      transactionId: 'transaction-1',
      baseRevision: 0,
      kind: 'direct',
      text: 'a'
    },
    wallTime: 2,
    nextAttemptId: () => `input-${++attempt}`
  });
  if (first.kind !== 'delta') throw new Error('Expected first delta.');
  engine.applyDelta(session, first.delta);
  const second = engine.calculate({
    session,
    snapshot,
    transaction: {
      type: 'submit',
      transactionId: 'transaction-2',
      baseRevision: 1,
      kind: 'direct',
      text: 'b'
    },
    wallTime: 3,
    nextAttemptId: () => `input-${++attempt}`
  });
  if (second.kind !== 'delta') throw new Error('Expected second delta.');
  return { session, deltas: [first.delta, second.delta] };
}
