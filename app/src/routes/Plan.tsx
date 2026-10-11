// /plan/:matchId: the city plan a table made, as a page anyone with the link can open. The map shows what
// was built. Three columns keep three kinds of thing apart: what is documented (the real stories with
// their sources, the real zoning and FEMA facts of each place), what the game simulated (the illustrative
// city numbers and the storm), and what the group decided (who proposed, supported, opposed, which
// changes were accepted). Everything is replayed from the stored match record through the shared engine.
import { useEffect, useMemo, useState } from 'react';
import {
  CARDS, INDICATORS, INDICATOR_INFO, PERSONA_INFO, PLAIN, PROJECTS, START_INDICATORS, beginnerEnd, districtById, districtFacts, replayMatch, startCity,
  type MatchRecord,
} from '@shared';
import { match } from '../api';
import { CityMap } from '../map/CityMap';
import { Link } from '../router';
import { SourceChips } from '../game/story';
import { outcomeSentence } from '../game/Climax';

export function Plan({ matchId }: { matchId: string }) {
  const [rec, setRec] = useState<MatchRecord | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    match(matchId).then((m) => setRec(m ?? null), () => setRec(null));
  }, [matchId]);
  const replay = useMemo(() => (rec ? replayMatch(rec) : null), [rec]);
  if (rec === undefined) return <main className="plan"><p className="plan-card bm-key">Loading the plan…</p></main>;
  if (!rec || !replay) return <main className="plan"><p className="plan-card bm-key">No plan with this link. <Link to="/" className="underline">Back to the beach.</Link></p></main>;

  const res = replay.comparable ? replay.rounds : [];
  const city = res.at(-1)?.city ?? startCity();
  const end = res.at(-1)?.after ?? START_INDICATORS;
  const who = (seat: number) => rec.players.find((p) => p.seat === seat);
  const outcome = beginnerEnd(START_INDICATORS, end, res, rec.players.map((p) => p.persona));
  const built = res.flatMap((r) => r.outcomes).filter((o) => o.status === 'approved');
  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true), () => setCopied(false));
  };

  return (
    <main className="plan bm">
      <header className="plan-card plan-head">
        <div>
          <p className="bm-label">Miami Beach coastal plan · {rec.mode === 'beginner' ? 'Beginner Mode' : 'Advanced'} · {new Date(rec.startedAt).toLocaleDateString()}</p>
          <h1 className="bm-hero">{outcome.viable ? 'A viable plan' : 'A plan with gaps'}{outcome.storm ? (outcome.storm.held ? ' that survived the storm' : ' that the storm flooded') : ''}</h1>
          <p className="bm-body">Made by {rec.players.map((p) => `${p.name} (${PERSONA_INFO[p.persona].name}${p.participant === 'bot' ? ', bot' : ''})`).join(', ')}.</p>
        </div>
        <button type="button" className="gel gel-lime" onClick={copy}>{copied ? 'Link copied ✓' : '🔗 Copy link to share'}</button>
      </header>

      <section className="plan-map" aria-label="What was built, on the real map">
        <CityMap city={city} spotlight={[...new Set(built.map((o) => o.district))]} overlays={{ flood: true, zoning: false }} padding={{ top: 30, bottom: 30, left: 30, right: 30 }} />
      </section>

      <div className="plan-cols">
        <section className="plan-card">
          <h2 className="bm-title">📰 Documented</h2>
          <p className="bm-small">Real stories and the real map. Facts as reported by the sources.</p>
          {rec.rounds.map((r) => (
            <div key={r.round} className="plan-item">
              <p className="bm-key">Round {r.round}: {r.crisis.story ? r.crisis.story.title : r.crisis.title}</p>
              {r.crisis.story ? <SourceChips sources={r.crisis.story.sources} max={5} /> : <p className="bm-small">Authored or live scenario, not a documented event.</p>}
            </div>
          ))}
          {[...new Set(rec.rounds.flatMap((r) => r.proposals.map((p) => p.district)))].map((d) => (
            <div key={d} className="plan-item">
              <p className="bm-key">📍 {districtById(d).name}</p>
              <ul className="bm-small">{districtFacts(districtById(d)).slice(0, 3).map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          ))}
        </section>

        <section className="plan-card">
          <h2 className="bm-title">🧮 Simulated</h2>
          <p className="bm-small">The game’s illustrative numbers, not predictions. Budgets are hypothetical.</p>
          <table className="plan-table">
            <tbody>
              {INDICATORS.map((k) => (
                <tr key={k}><td>{INDICATOR_INFO[k].icon} {PLAIN[k]}</td><td>{k === 'budget' ? `$${START_INDICATORS[k]}M` : START_INDICATORS[k]} → <b>{k === 'budget' ? `$${end[k]}M` : end[k]}</b></td></tr>
              ))}
            </tbody>
          </table>
          {outcome.storm && <p className="bm-body">🌀 Storm after round 3: {outcome.storm.held ? `held (flood safety ${outcome.storm.flood} of 50 needed)` : `flooded, −${outcome.storm.loss} jobs & business`}.</p>}
          <ul className="bm-small">{outcome.goals.map((g) => <li key={g.persona}>{g.achieved ? '✅' : '❌'} {PERSONA_INFO[g.persona].name}: {g.goal} · {g.line}</li>)}</ul>
        </section>

        <section className="plan-card">
          <h2 className="bm-title">🗳️ Decided</h2>
          <p className="bm-small">What this group chose, in their roles. Role-play is not public opinion.</p>
          {rec.rounds.map((r, i) => r.outcomes.map((o) => {
            const line = outcomeSentence(o);
            const backers = [...r.actions.filter((a) => a.proposalId === o.proposalId && a.move === 'back').map((a) => a.seat), ...r.attachments.filter((a) => a.proposalId === o.proposalId && CARDS[a.card].category === 'support' && a.seat !== o.seat).map((a) => a.seat)];
            const against = r.actions.filter((a) => a.proposalId === o.proposalId && a.move === 'oppose').map((a) => a.seat);
            const changes = res[i]?.outcomes.find((x) => x.proposalId === o.proposalId)?.conditions ?? o.conditions;
            return (
              <div key={o.proposalId} className={`plan-item result-row is-${o.status}`}>
                <p className="bm-key">{line.head}</p>
                <p className="bm-small">📍 {districtById(o.district).name} · proposed by {who(o.seat)?.name} ({PERSONA_INFO[o.persona].name}) · {line.reason}</p>
                {backers.length > 0 && <p className="bm-small">👍 {[...new Set(backers)].map((s) => who(s)?.name).join(', ')}</p>}
                {against.length > 0 && <p className="bm-small">👎 {against.map((s) => who(s)?.name).join(', ')}</p>}
                {changes.length > 0 && <p className="bm-small">🤝 Changes accepted: {changes.join('; ')}</p>}
                {o.status === 'approved' && <p className="bm-small">Built: {PROJECTS[o.kind].name}</p>}
              </div>
            );
          }))}
        </section>
      </div>
      <footer className="plan-card flex flex-wrap gap-2">
        <Link to={`/atlas?match=${rec.id}#matches`} className="gel">Open in the Civic Atlas</Link>
        <Link to={`/verify/${rec.id}`} className="gel">Verify this match on Solana</Link>
        <Link to="/" className="gel">Play a match</Link>
      </footer>
    </main>
  );
}
