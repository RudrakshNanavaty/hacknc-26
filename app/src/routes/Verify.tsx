// /verify/:matchId: anyone can check that a match's planning feedback is on the public record and
// unchanged, without trusting our server. This browser rebuilds the match's fingerprint from the
// public match record, walks the Merkle proof to the batch root, and reads both memos straight from
// a Solana devnet node. (Ported from Mayday Mayor's /verify/:playId.)
import { useEffect, useState } from 'react';
import { matchFingerprint, matchFingerprintInput, verifyProof, type MatchFingerprintInput, type MatchRecord } from '@shared';
import { Link } from '../router';
import { LagoonBubbles } from '../game/ui';

const RPC = 'https://api.devnet.solana.com';

interface ProofView {
  enabled: boolean;
  authorityLabel: string;
  match: { matchId: string; input: MatchFingerprintInput; fingerprint: string; proof: string[] | null; memo: { text: string; status: string; signature: string | null; explorerUrl: string | null } | null };
  anchor: { root: string; count: number; memo: string; status: string; signature: string | null; explorerUrl: string | null } | null;
}

type Check = { label: string; ok: boolean | null; detail: string };

/** The memo text of a transaction, read from the chain. */
async function memoOnChain(signature: string): Promise<string | null> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }),
  });
  const body = (await res.json()) as { result?: { meta?: { logMessages?: string[] } } | null };
  const line = body.result?.meta?.logMessages?.find((l) => l.startsWith('Program log: Memo'));
  return line ? (/: "(.*)"$/.exec(line)?.[1] ?? null) : null;
}

export function Verify({ matchId }: { matchId: string }) {
  const [view, setView] = useState<ProofView | null | 'missing'>(null);
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    let live = true;
    const push = (c: Check) => live && setChecks((cs) => [...cs.filter((x) => x.label !== c.label), c]);
    void (async () => {
      const [pv, mr] = await Promise.all([
        fetch(`/api/solana/proof/${matchId}`).then((r) => (r.ok ? (r.json() as Promise<ProofView>) : null)).catch(() => null),
        fetch(`/api/matches/${matchId}`).then((r) => (r.ok ? (r.json() as Promise<MatchRecord>) : null)).catch(() => null),
      ]);
      if (!live) return;
      if (!pv) return setView('missing');
      setView(pv);
      setRecord(mr);
      // 1. The match record we serve still hashes to the fingerprint that went on chain (or, if the full
      //    record is gone, the stored fingerprint input does).
      const print = await matchFingerprint(mr ? matchFingerprintInput(mr) : pv.match.input);
      push({
        label: 'Fingerprint', ok: print === pv.match.fingerprint,
        detail: mr ? `SHA-256 of the match's decisions, rebuilt here from the public record: ${print.slice(0, 16)}…` : `SHA-256 rebuilt from the stored decisions (the full match record is not on this server): ${print.slice(0, 16)}…`,
      });
      // 2. The match's own memo: its outcomes in words, with that fingerprint.
      if (pv.match.memo?.signature) {
        push({ label: 'Decisions on Solana', ok: null, detail: 'Reading the match memo from a devnet node…' });
        try {
          const memo = await memoOnChain(pv.match.memo.signature);
          push({ label: 'Decisions on Solana', ok: !!memo && memo.includes(print), detail: memo ? `Memo on chain: ${memo}` : 'The transaction has no memo.' });
        } catch {
          push({ label: 'Decisions on Solana', ok: null, detail: 'Could not reach a devnet node from this browser.' });
        }
      } else push({ label: 'Decisions on Solana', ok: null, detail: pv.enabled ? 'The match memo is being written…' : 'The Solana record is off on this server.' });
      // 3. The match is in an anchored batch.
      if (!pv.anchor || pv.anchor.status !== 'confirmed' || !pv.match.proof) {
        push({ label: 'In an anchored batch', ok: null, detail: 'Matches go on Solana in batches every couple of minutes. Check back shortly.' });
        return;
      }
      const inTree = await verifyProof(print, pv.match.proof, pv.anchor.root);
      push({ label: 'In an anchored batch', ok: inTree, detail: `Merkle proof of ${pv.match.proof.length} step${pv.match.proof.length === 1 ? '' : 's'} to root ${pv.anchor.root.slice(0, 16)}… (${pv.anchor.count} match${pv.anchor.count === 1 ? '' : 'es'})` });
      try {
        const memo = await memoOnChain(pv.anchor.signature!);
        push({ label: 'Batch on Solana', ok: memo === pv.anchor.memo && !!memo?.includes(pv.anchor.root), detail: memo ? `Memo on chain: ${memo}` : 'The transaction has no memo.' });
      } catch {
        push({ label: 'Batch on Solana', ok: null, detail: 'Could not reach a devnet node from this browser.' });
      }
    })();
    return () => {
      live = false;
    };
  }, [matchId]);

  const v = view && view !== 'missing' ? view : null;
  const stories = record?.rounds.map((r) => r.crisis.story?.title ?? r.crisis.title) ?? [];
  return (
    <main className="lagoon relative min-h-full px-4 py-6">
      <LagoonBubbles count={14} />
      <div className="relative mx-auto flex max-w-2xl flex-col gap-4">
        <header className="flex items-center justify-between">
          <Link to="/" className="vr text-24 text-white drop-shadow">Coastal Clash</Link>
          <span className="lchip">Public record</span>
        </header>
        {view === null && <p className="wet p-6 text-18">Checking the record…</p>}
        {view === 'missing' && <p className="wet p-6 text-18">This match is not on the public record yet. Records are written when a match ends.</p>}
        {v && (
          <section className="wet flex flex-col gap-3 p-5">
            <h1 className="glow-title">Is this match on the public record?</h1>
            <p className="text-15 font-semibold">
              Your browser checks it on its own, with no trust in our server needed. Match <span className="tabular">{matchId.slice(0, 8)}</span>, room {record?.roomCode ?? v.match.input.roomCode}, {record?.sessionKind ?? v.match.input.sessionKind} session.
              {stories.length > 0 && <> Stories: {stories.join(' · ')}.</>}
            </p>
            <ol className="flex flex-col gap-2">
              {checks.map((c) => (
                <li key={c.label} className={`verify-check ${c.ok === true ? 'ok' : c.ok === false ? 'bad' : ''}`}>
                  <p className="vr text-18">{c.ok === true ? '✓' : c.ok === false ? '✗' : '…'} {c.label}</p>
                  <p className="text-13 break-all">{c.detail}</p>
                </li>
              ))}
            </ol>
            <p className="flex flex-wrap gap-2">
              {v.match.memo?.explorerUrl && <a className="source-chip" href={v.match.memo.explorerUrl} target="_blank" rel="noreferrer">Decisions on Solana Explorer</a>}
              {v.anchor?.explorerUrl && <a className="source-chip" href={v.anchor.explorerUrl} target="_blank" rel="noreferrer">Batch on Solana Explorer</a>}
              <Link className="source-chip" to={`/studio?match=${matchId}`}>This match in Planning Studio</Link>
            </p>
            <p className="text-13 font-semibold opacity-80">
              Tamper-evident, not a vote count: it proves the match's decisions were recorded and have not changed, not who played. No names go on chain. {v.authorityLabel}, Solana devnet.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
