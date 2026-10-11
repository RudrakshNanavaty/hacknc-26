// The civic record's completeness layer, ported from Mayday Mayor for consensusclub: every finished
// match gets a fingerprint of its decisions and its own memo (its outcomes in words) on Solana;
// matches are anchored in batches as one Memo transaction carrying a Merkle root, and each keeps its
// proof. Fail soft: nothing here ever blocks a match, and a failed transaction leaves matches for
// the next batch. Planners, journalists and residents can then check that the feedback a match
// produced was recorded and has not changed, without trusting our database.
import { randomUUID } from 'node:crypto';
import { matchDecisionWords, matchFingerprint, matchFingerprintInput, matchMemo, matchesMemo, merkleTree, type MatchRecord } from '@shared';
import { type Chain, explorerTx } from './chain';
import type { Anchor, CivicStore, MatchProof } from './store';

const MAX_BATCH = 256;

export interface CivicLog {
  info(msg: string): void;
  warn(obj: unknown, msg: string): void;
}

export const withExplorer = (a: Anchor) => ({ ...a, explorerUrl: a.signature ? explorerTx(a.signature) : null });

export function civicRecord({ store, chain, log, batchMs = 2 * 60_000 }: { store: CivicStore; chain: Chain | null; log: CivicLog; batchMs?: number }) {
  let sending: Promise<unknown> = Promise.resolve();
  let flushing: Promise<Anchor | null> = Promise.resolve(null);

  /** The match's own memo, one at a time; never throws. */
  function sendMemo(m: MatchProof, decisions: string[] | null): Promise<unknown> {
    if (!chain) return Promise.resolve();
    // A retry re-sends the same text (it is already on the record), only made ASCII-safe.
    const text = decisions ? matchMemo(m.input, m.fingerprint, decisions) : m.memo!.text.replace(/…/g, '...');
    sending = sending
      .then(async () => {
        let memo: NonNullable<MatchProof['memo']>;
        try {
          memo = { text, status: 'confirmed', ...(await chain.memo(text)) };
        } catch (err) {
          memo = { text, status: 'failed', signature: null, slot: null, error: (err as Error).message.slice(0, 200) };
          log.warn({ err: memo.error }, `civic: match ${m.matchId.slice(0, 8)} not written to Solana`);
        }
        const latest = (await store.match(m.matchId)) ?? m;
        await store.saveMatch({ ...latest, memo });
      })
      .catch((err) => log.warn({ err }, 'civic: match memo failed'));
    return sending;
  }

  /** Fingerprints a finished match (once) and writes its memo; anchoring comes with the next batch. */
  async function recordMatch(record: MatchRecord): Promise<MatchProof | null> {
    if (!record.final) return null;
    const existing = await store.match(record.id);
    if (existing) return existing;
    const input = matchFingerprintInput(record);
    const m: MatchProof = { matchId: record.id, input, fingerprint: await matchFingerprint(input), anchorId: null, proof: null, memo: null };
    await store.saveMatch(m);
    void sendMemo(m, matchDecisionWords(record)).then(() => flush());
    return m;
  }

  /** Re-sends the memos that failed (a dropped transaction, a full block): the record heals itself. */
  async function retryMemos() {
    for (const m of await store.failedMemos(16)) await sendMemo(m, null);
  }

  async function anchorWaiting(): Promise<Anchor | null> {
    if (!chain) return null;
    await retryMemos();
    const waiting = await store.unanchored(MAX_BATCH);
    if (!waiting.length) return null;
    // One batch is one data version (it is in the memo).
    const build = waiting[0]!.input.dataVersion;
    const batch = waiting.filter((m) => m.input.dataVersion === build);
    const { root, proofs } = await merkleTree(batch.map((m) => m.fingerprint));
    const anchor: Anchor = {
      id: randomUUID(), kind: 'matches', createdAt: new Date().toISOString(), root, count: batch.length,
      memo: matchesMemo(root, batch.length, build), status: 'pending', signature: null, slot: null,
    };
    try {
      Object.assign(anchor, { status: 'confirmed' }, await chain.memo(anchor.memo));
    } catch (err) {
      anchor.status = 'failed';
      anchor.error = (err as Error).message.slice(0, 200);
      await store.saveAnchor(anchor);
      log.warn({ err: anchor.error }, `civic: anchoring ${batch.length} matches failed; they wait for the next batch`);
      return anchor;
    }
    await store.saveAnchor(anchor);
    await Promise.all(batch.map(async (m, i) => store.saveMatch({ ...((await store.match(m.matchId)) ?? m), anchorId: anchor.id, proof: proofs[i]! })));
    log.info(`civic: anchored ${batch.length} matches on Solana ${explorerTx(anchor.signature!)}`);
    return anchor;
  }

  function flush(): Promise<Anchor | null> {
    flushing = flushing.catch(() => null).then(anchorWaiting).catch((err) => {
      log.warn({ err }, 'civic: flush failed');
      return null;
    });
    return flushing;
  }

  const timer = setInterval(() => void flush(), batchMs);
  timer.unref();

  async function proof(matchId: string) {
    const m = await store.match(matchId);
    if (!m) return null;
    const anchor = m.anchorId ? await store.anchor(m.anchorId) : null;
    return { match: { ...m, memo: m.memo ? { ...m.memo, explorerUrl: m.memo.signature ? explorerTx(m.memo.signature) : null } : null }, anchor: anchor ? withExplorer(anchor) : null };
  }

  return {
    enabled: chain !== null,
    address: chain?.address ?? null,
    store,
    recordMatch,
    flush,
    proof,
    /** Resolves when every memo queued so far is written (tests, shutdown). */
    memosSent: () => sending,
    close: () => clearInterval(timer),
  };
}

export type CivicRecord = ReturnType<typeof civicRecord>;
