// Money on screen, in the Aero Lagoon look: wallet pills, the agreement card (accept / decline with an impact
// preview), the ledger with each entry's bank-mirror status, the loan card and transaction toasts. Every amount
// comes from the engine's books in RoomState (simulated money); the bank mirror's status is shown beside the game,
// never instead of it.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PERSONA_INFO, PERSONA_WALLETS, PROJECTS, WALLET_INFO, agreementPreview, checkAfford, districtById, inMillions, usd,
  type BankSync, type Compromise, type LedgerEntry, type RoomState, type WalletId,
} from '@shared';
import type { Room } from '../room/useRoom';
import { deltaText, STATUS_STYLE } from './format';

const SYNC_LABEL: Record<BankSync['status'] | 'off' | 'queued', { label: string; tone: string; title: string }> = {
  queued: { label: 'queued', tone: 'sync-off', title: 'Copied to the Nessie mirror when this round resolves' },
  pending: { label: 'syncing', tone: 'sync-pending', title: 'Waiting to be copied to the Nessie mirror' },
  uncertain: { label: 'checking', tone: 'sync-uncertain', title: 'A write timed out; the mirror is reading Nessie to see whether it landed' },
  confirmed: { label: 'mirrored', tone: 'sync-ok', title: 'Recorded on a simulated Nessie account' },
  failed: { label: 'not mirrored', tone: 'sync-failed', title: 'The mirror gave up on this entry; the game is not affected' },
  off: { label: 'not mirrored', tone: 'sync-off', title: 'The bank mirror is off on this server' },
};

/** This entry's mirror status (the game never waits on it). */
export function syncOf(state: RoomState, e: LedgerEntry): BankSync | null {
  return state.bank.items.find((i) => i.kind === 'transfer' && i.entryId === e.id && (!state.matchId || i.matchId === state.matchId)) ?? null;
}

export function SyncChip({ state, e }: { state: RoomState; e: LedgerEntry }) {
  const it = syncOf(state, e);
  const s = SYNC_LABEL[state.bank.mirror === 'off' ? 'off' : it?.status ?? 'queued'];
  return <span className={`sync-chip ${s.tone}`} title={`${s.title}${it?.externalId ? ` (record ${it.externalId})` : ''}${it?.error ? `: ${it.error}` : ''}`}>{s.label}</span>;
}

const walletName = (w: WalletId) => WALLET_INFO[w].short;

/** One ledger line: who paid whom, how much, why, and its mirror status. */
export function LedgerLine({ state, e }: { state: RoomState; e: LedgerEntry }) {
  return (
    <li className="ledger-line">
      <span className="lchip lchip-aqua !px-2 !py-0">{e.rule}</span>
      <span className="min-w-0 flex-1">
        <b>{WALLET_INFO[e.from].icon} {walletName(e.from)} → {WALLET_INFO[e.to].icon} {walletName(e.to)}</b> <span className="amt">{usd(e.amount)}</span>
        <span className="block text-[11px] opacity-75">{e.text}</span>
      </span>
      <SyncChip state={state} e={e} />
    </li>
  );
}

/** Wallet pills over the map: the public budget, what the city owes, and each player's own money (public at the table). */
export function Wallets({ state }: { state: RoomState }) {
  const t = state.city.treasury;
  const debt = inMillions(t.debts.reduce((s, d) => s + d.outstanding, 0));
  const mine = state.players.find((p) => p.seat === state.you);
  return (
    <div className="wallets" aria-label="Money, simulated">
      {debt > 0 && <span className="wallet-pill w-debt" title="Still owed to the simulated lender: bonds and arrears">🏦 owes ${debt}M</span>}
      {mine && PERSONA_WALLETS[mine.persona] !== 'city' && (
        <span className="wallet-pill w-mine" title={`Your ${WALLET_INFO[PERSONA_WALLETS[mine.persona]].name} (simulated)`}>
          {WALLET_INFO[PERSONA_WALLETS[mine.persona]].icon} you ${inMillions(t.balances[PERSONA_WALLETS[mine.persona]])}M
        </span>
      )}
      <span className="wallet-note">simulated $</span>
    </div>
  );
}

/** A player's money in their bubble (the Mayor's is the public budget). */
export function WalletOf({ state, persona }: { state: RoomState; persona: keyof typeof PERSONA_WALLETS }) {
  const w = PERSONA_WALLETS[persona];
  return <span className="text-[11px] font-black opacity-80" title={`${WALLET_INFO[w].name} (simulated)`}>{w === 'city' ? '🏛️' : '💼'} ${inMillions(state.city.treasury.balances[w])}M</span>;
}

/** The agreement card: the terms, who pays, the strings, and what accepting changes, with accept / decline for its owner. */
export function AgreementCard({ c, state, room }: { c: Compromise; state: RoomState; room: Room }) {
  const t = c.terms!;
  const negotiating = state.phase === 'negotiate';
  const mine = c.owner === state.you && c.offeredBy !== state.you;
  const board = state.board!;
  // The engine run both ways: the impact preview can never disagree with the resolution.
  const pv = useMemo(() => agreementPreview(board, state.actions, state.city, c.id), [board, state.actions, state.city, c.id]);
  const afford = useMemo(() => checkAfford(state.city.treasury, board, state.actions, c.id), [state.city.treasury, board, state.actions, c.id]);
  const p = board.proposals.find((x) => x.id === c.proposalId)!;
  const by = state.players.find((x) => x.seat === c.offeredBy);
  const owner = state.players.find((x) => x.seat === c.owner);
  return (
    <div className={`agreement-card wet ${c.accepted ? 'is-accepted' : c.declined ? 'is-declined' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="vr text-16 leading-tight">🤝 {t.name}</p>
        <span className={`lchip ${c.accepted ? 'lchip-lime' : c.declined ? 'lchip-coral' : 'lchip-sun'}`}>{c.accepted ? 'Accepted' : c.declined ? 'Declined' : 'On the table'}</span>
      </div>
      <p className="text-12 font-semibold opacity-80">Offered by {by?.name} ({PERSONA_INFO[by?.persona ?? 'mayor'].name}) on the {PROJECTS[p.kind].name.toLowerCase()} in {districtById(p.district).name}{c.owner !== c.offeredBy ? ` · ${owner?.name} decides` : ' · signed by its payer'}</p>
      <div className="deal-flow">
        <span className="deal-wallet">{WALLET_INFO[t.funder].icon}<b>{walletName(t.funder)}</b></span>
        <span className="deal-arrow">{usd(t.amount)} →<small>if approved</small></span>
        <span className="deal-wallet">{WALLET_INFO[t.to].icon}<b>{walletName(t.to)}</b></span>
      </div>
      {t.schedule.length > 0 && (
        <ul className="deal-strings">
          {t.schedule.map((s, i) => <li key={i}>⏳ {s.dueRound > state.totalRounds ? 'End of session' : `Round ${s.dueRound}`}: {walletName(s.from)} pays {usd(s.amount)} to {walletName(s.to)} ({s.kind === 'debt-service' ? 'installment' : 'availability payment'})</li>)}
        </ul>
      )}
      <p className="text-12 font-semibold">{c.text}</p>
      {pv && (
        <div className="deal-impact">
          <span>Accept: <b style={{ color: STATUS_STYLE[pv.withIt].color }}>{STATUS_STYLE[pv.withIt].label}</b></span>
          <span>Refuse: <b style={{ color: STATUS_STYLE[pv.without].color }}>{STATUS_STYLE[pv.without].label}</b></span>
          {pv.withIt === 'approved' && <span>Built: <b>{deltaText(pv.delta) || 'no change'}</b></span>}
          {pv.result === 'not-needed' && <span className="opacity-80">Someone else pays first: this deal would move no money.</span>}
          {pv.result === 'void' && <span className="text-[#c0392b]">The payer could not pay at the resolution: void.</span>}
        </div>
      )}
      {afford && !c.accepted && <p className="warn-line">⚠ {afford}</p>}
      {negotiating && mine && (
        <div className="flex gap-2">
          {!c.accepted && <button type="button" className="gel gel-lime gel-sm" disabled={!!afford} onClick={() => room.accept(c.id)}>✓ Accept</button>}
          {!c.declined && <button type="button" className="gel gel-coral gel-sm" onClick={() => room.decline(c.id)}>✕ Decline</button>}
        </div>
      )}
      {negotiating && !mine && !c.accepted && <p className="text-[12px] opacity-75">Waiting for {owner?.name} to decide…</p>}
      <p className="text-[10px] font-bold opacity-60">Simulated money. The rules move it only if the project is approved and the payer can pay then.</p>
    </div>
  );
}

/** Bonds and arrears: what the city borrowed, what it still owes, and when. */
export function LoanCard({ state }: { state: RoomState }) {
  const t = state.city.treasury;
  if (!t.debts.length) return null;
  return (
    <div className="loan-card frost flex flex-col gap-1.5 p-3">
      <p className="vr text-15">🏦 What the city owes <span className="text-[11px] opacity-70">(simulated lender)</span></p>
      {t.debts.map((d) => {
        const due = t.obligations.filter((o) => o.debtId === d.id);
        return (
          <div key={d.id} className="text-12 font-semibold">
            <b>{d.kind === 'bond' ? 'Resilience bond' : 'Arrears'}</b> from round {d.round}: borrowed {usd(d.principal)}, still owes <b>{usd(d.outstanding)}</b>
            {due.length > 0 && <span className="block opacity-80">Next: {due.map((o) => `${usd(o.amount)} ${o.dueRound > state.totalRounds ? 'at the end' : `in round ${o.dueRound}`}`).join(', ')}</span>}
            {d.kind === 'arrears' && <span className="block opacity-80">A bill the budget could not pay (rule B3).</span>}
          </div>
        );
      })}
      {state.bank.items.some((i) => i.kind === 'loan') && <p className="text-[11px] opacity-75">Bonds are also mirrored as loan records on the simulated Nessie city account.</p>}
    </div>
  );
}

/** The whole match's ledger, compact, with the mirror's status per entry. */
export function LedgerPanel({ state, onClose }: { state: RoomState; onClose: () => void }) {
  const entries = [...state.city.treasury.ledger].reverse();
  const items = state.bank.items;
  const counts = { confirmed: 0, pending: 0, uncertain: 0, failed: 0 };
  for (const i of items) counts[i.status] += 1;
  return (
    <div className="ledger-panel wet" role="dialog" aria-label="Ledger">
      <div className="flex items-center justify-between gap-2">
        <p className="vr text-16">📒 Ledger <span className="text-[11px] opacity-70">simulated money</span></p>
        <button type="button" className="hint-x" aria-label="Close the ledger" onClick={onClose}>✕</button>
      </div>
      <p className="text-[11px] font-bold opacity-80">
        {state.bank.mirror === 'nessie'
          ? `Mirrored to Capital One Nessie (fictional accounts): ${counts.confirmed} mirrored${counts.pending ? `, ${counts.pending} syncing` : ''}${counts.uncertain ? `, ${counts.uncertain} checking` : ''}${counts.failed ? `, ${counts.failed} not mirrored` : ''}. The game's own books decide.`
          : 'Bank mirror off: the game keeps its own books (the only ones that decide).'}
      </p>
      <LoanCard state={state} />
      {entries.length ? <ol className="flex flex-col gap-1">{entries.map((e) => <LedgerLine key={e.id} state={state} e={e} />)}</ol> : <p className="text-13 opacity-75">No money has moved yet.</p>}
    </div>
  );
}

/** Transaction toasts when a round's money moves (one per entry, a few seconds each). */
export function MoneyToasts({ state }: { state: RoomState }) {
  const [shown, setShown] = useState<LedgerEntry[]>([]);
  const seen = useRef(new Set<string>());
  const last = state.history.at(-1);
  useEffect(() => {
    if (state.phase !== 'resolve' || !last) return;
    const fresh = last.resolution.city.treasury.ledger.filter((e) => e.round === last.round && !seen.current.has(e.id));
    if (!fresh.length) return;
    fresh.forEach((e) => seen.current.add(e.id));
    setShown(fresh.slice(0, 5));
    const t = setTimeout(() => setShown([]), 6500);
    return () => clearTimeout(t);
  }, [state.phase, last]);
  if (!shown.length) return null;
  return (
    <div className="money-toasts" aria-live="polite">
      {shown.map((e, i) => (
        <div key={e.id} className="money-toast wet" style={{ animationDelay: `${i * 0.18}s` }}>
          <span className="text-18">{e.kind === 'arrears' ? '⚠️' : e.kind === 'grant' ? '🎁' : e.kind === 'bond' ? '🏦' : '💸'}</span>
          <span className="min-w-0 flex-1 text-12 font-bold">{walletName(e.from)} → {walletName(e.to)} <b className="amt">{usd(e.amount)}</b><span className="block text-[10px] opacity-75">{e.rule} · simulated</span></span>
          <SyncChip state={state} e={e} />
        </div>
      ))}
    </div>
  );
}

/** This round's money on the result screen. */
export function RoundMoney({ state }: { state: RoomState }) {
  const last = state.history.at(-1);
  if (!last) return null;
  const entries = last.resolution.city.treasury.ledger.filter((e) => e.round === last.round);
  const deals = last.resolution.agreements ?? [];
  if (!entries.length && !deals.length) return null;
  return (
    <div className="frost flex flex-col gap-1.5 p-3">
      <p className="vr text-15">💸 Money this round <span className="text-[11px] opacity-70">(simulated)</span></p>
      {deals.map((a) => <p key={a.compromiseId} className="text-12 font-semibold">🤝 {a.text} <span className={`lchip !py-0 text-[10px] ${a.status === 'executed' ? 'lchip-lime' : a.status === 'void' ? 'lchip-coral' : ''}`}>{a.status}</span></p>)}
      <ol className="flex flex-col gap-1">{entries.map((e) => <LedgerLine key={e.id} state={state} e={e} />)}</ol>
    </div>
  );
}
