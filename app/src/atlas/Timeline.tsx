// One match, round by round: every card, negotiation move, rule and outcome, and the replay check that
// the engine reproduces the record on its own.
import { useMemo } from 'react';
import { CARDS, COMBOS, PERSONA_INFO, PROJECTS, districtById, replayMatch, type MatchRecord } from '@shared';
import { STATUS_STYLE, deltaText } from '../game/format';

export function Timeline({ m }: { m: MatchRecord }) {
  const name = (seat: number) => m.players.find((p) => p.seat === seat);
  const replay = useMemo(() => replayMatch(m), [m]);
  return (
    <ol className="flex flex-col gap-3">
      <li className={`rounded-2xl p-2 text-13 font-bold ${!replay.comparable ? 'bg-white/60' : replay.matches ? 'bg-leaf/20' : 'bg-coral/20'}`}>
        {!replay.comparable
          ? `Replay check skipped: ${replay.reason}`
          : replay.matches ? 'Replay check passed: the engine reproduces this match from the record alone (no AI calls).' : `Replay differs: ${replay.mismatches.join(', ')}`}
      </li>
      {m.rounds.map((r) => (
        <li key={r.round} className="rounded-2xl bg-white/60 p-3">
          <p className="font-display text-18 font-black">Round {r.round} · {typeof r.crisis === 'string' ? (r.crisis as string).replace('-', ' ') : r.crisis.title}</p>
          <p className="text-13 italic">“{r.headline}”</p>
          {r.director?.event && (
            <p className="mt-1 rounded-xl bg-lilac/20 p-2 text-13">
              <b>Game event (fictional):</b> {r.director.event.title}, {districtById(r.director.event.district).name}, magnitude {r.director.event.magnitude} · {deltaText(r.director.event.delta)}
              <span className="chip ml-1 text-[11px]">{r.director.event.source === 'gemini' ? 'AI-proposed, rules-checked' : 'authored'}</span>
            </p>
          )}
          {(r.combos ?? []).map((c) => <p key={c.combo + c.district} className="text-13">Combo: {COMBOS[c.combo].name}, {districtById(c.district).name}</p>)}
          {r.director && r.director.hints.length > 0 && (
            <p className="text-[12px] opacity-80">Table hints: {r.director.hints.length} shown ({r.director.hints.filter((h) => h.source === 'gemini').length} AI-worded), {r.director.hints.filter((h) => h.followed).length} followed by a player.</p>
          )}
          <ul className="mt-2 flex flex-col gap-1 text-13">
            {r.proposals.filter((p) => !p.carried).map((p) => <li key={p.id}>{name(p.seat)?.name} ({PERSONA_INFO[p.persona].name}) proposed {PROJECTS[p.kind].name} in {districtById(p.district).name}</li>)}
            {r.attachments.map((a) => <li key={`${a.seat}-${a.card}`}>{name(a.seat)?.name} played {CARDS[a.card].name} in {districtById(a.district).name}</li>)}
            {r.actions.map((a) => <li key={`${a.seat}-${a.proposalId}`}>{name(a.seat)?.name} {a.move === 'back' ? 'backed' : a.move === 'oppose' ? 'opposed' : 'funded'} {a.proposalId}</li>)}
            {r.compromises.map((c) => <li key={c.id}>{c.title}: {c.accepted ? 'accepted' : 'refused'}</li>)}
          </ul>
          <ul className="mt-2 flex flex-col gap-1">
            {r.outcomes.map((o) => (
              <li key={o.proposalId} className="text-13">
                <span className="status-pill mr-1" style={{ background: STATUS_STYLE[o.status].bg, color: STATUS_STYLE[o.status].color }}>{STATUS_STYLE[o.status].label}</span>
                {PROJECTS[o.kind].name}, {districtById(o.district).name} · {o.support} vs {o.opposition}{o.status === 'approved' ? ` · ${deltaText(o.delta)}` : ''}
                <span className="block pl-2 text-[11px] opacity-70">Rules: {o.rules.map((id) => r.events.find((e) => e.id === id)?.rule).join(' → ')}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
      {m.responses.length > 0 && (
        <li className="rounded-2xl border-2 border-sun bg-white/70 p-3 text-13">
          <p className="font-bold">Personal preferences (outside the role)</p>
          {m.responses.map((r) => (
            <p key={r.seat}>{name(r.seat)?.name}, who played the {PERSONA_INFO[r.persona].name}: {r.kind && r.district ? `${PROJECTS[r.kind].name}, ${districtById(r.district).name}` : 'none of the proposals'}</p>
          ))}
        </li>
      )}
    </ol>
  );
}
