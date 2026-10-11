// Civic Atlas for the Planning Edition: four views of what many matches add up to.
//   Real issues · Human decisions · Plan explorer · Planning insights
// Role-play is never shown as public opinion: voluntary personal answers have their own panels, demo
// sessions and bots are labelled, and every figure carries its sample size.
import { useEffect, useState } from 'react';
import { FUTURES, MIN_N, PERSONA_INFO, PERSONAS, SIM_DISCLAIMER, type FutureId, type SessionKind } from '@shared';
import { planAtlas, type PlanAtlasData } from '../api';
import { RateBar, Stat } from './parts';

type View = 'issues' | 'decisions' | 'explorer' | 'insights';
const VIEWS: { id: View; label: string }[] = [
  { id: 'issues', label: 'A · Real issues' },
  { id: 'decisions', label: 'B · Human decisions' },
  { id: 'explorer', label: 'C · Plan explorer' },
  { id: 'insights', label: 'D · Planning insights' },
];

const KIND: Record<string, string> = { official: 'City / official', news: 'News', advocacy: 'Advocacy', industry: 'Industry', other: 'Other' };

export function PlanAtlasView({ session, bots }: { session: SessionKind | 'all'; bots: boolean }) {
  const [data, setData] = useState<PlanAtlasData | null | 'loading'>('loading');
  const [view, setView] = useState<View>('insights');
  const [future, setFuture] = useState<FutureId>('extreme');
  useEffect(() => {
    let live = true;
    const load = () => planAtlas(session, bots).then((d) => live && setData(d));
    void load();
    const t = setInterval(load, 8000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [session, bots]);

  if (data === 'loading') return <p className="glass p-6 text-18">Loading records...</p>;
  if (!data) return <p className="glass p-6 text-18">The atlas could not reach the server.</p>;
  const a = data.atlas;
  const s = a.scope;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Matches" value={s.matches} note={`${s.completed} finished`} />
        <Stat label="Human seats" value={s.humanSeats} note={`${s.botSeats} bot seats`} />
        <Stat label="Sessions" value={s.sessions.community} note={`${s.sessions.demo} demo / playtest`} />
        <Stat label="Personal answers" value={s.personalAnswers} note="voluntary, outside the role" />
        <Stat label="Plans tried" value={a.explorer.distinctPlans} note={`of ${a.explorer.feasiblePlans} feasible`} />
        <Stat label="Rules" value="planning-1.0.0" note={data.store === 'tiger' ? 'Tiger Data' : 'local store'} />
      </div>
      {s.matches > 0 && s.matches < MIN_N && <p className="glass p-3 text-13"><b>Small sample:</b> {s.matches} match{s.matches > 1 ? 'es' : ''}. Everything below is a lead to check, not a finding. {s.sessions.demo > 0 && 'Demo and playtest sessions are included unless you filter to Community.'}</p>}
      {s.matches === 0 && <p className="glass p-3 text-13">No Planning Edition matches have been saved yet. The issues below are the real situations players will face.</p>}
      <nav className="flex flex-wrap gap-1.5" aria-label="Planning Atlas views">
        {VIEWS.map((v) => <button key={v.id} type="button" className="aero-btn !py-1 text-13" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>)}
        <a className="aero-btn aero-btn-aqua !py-1 text-13" href={`/api/atlas/plan/export.csv?session=${session}`}>Every decision (CSV)</a>
      </nav>

      {view === 'issues' && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {a.issues.map((i) => (
            <article key={i.scenarioId} className="glass flex flex-col gap-2 p-4">
              <p className="text-13 font-black uppercase opacity-70">{i.districtName} · played {i.rounds}×</p>
              <h2 className="font-display text-24 leading-tight font-black">{i.title}</h2>
              <p className="text-15">{i.situation}</p>
              <p className="font-display text-18">{i.question}</p>
              <div>
                <p className="text-13 font-black">Three alternatives</p>
                <ul className="list-disc pl-5 text-13">{i.options.map((o) => <li key={o.id}><b>{o.name}</b> ({o.cost} units): {o.does}</li>)}</ul>
              </div>
              <div>
                <p className="text-13 font-black">Allowed amendments (one a round)</p>
                <ul className="list-disc pl-5 text-13">{i.amendments.map((m) => <li key={m.id}><b>{m.name}</b> ({m.cost >= 0 ? '+' : '−'}{Math.abs(m.cost)}) answers “{m.addresses}”</li>)}</ul>
              </div>
              {i.constraints.length > 0 && <p className="text-13"><b>Cannot proceed alone:</b> {i.constraints.join(' ')}</p>}
              <details className="text-13">
                <summary className="cursor-pointer font-black">{i.sources.length} sources · {i.verification.status}</summary>
                <ul className="mt-1 flex flex-col gap-1">{i.sources.map((src) => <li key={src.id}><a className="underline" href={src.url} target="_blank" rel="noreferrer noopener">{src.title}</a> <span className="chip text-[11px]">{src.outlet} · {KIND[src.kind] ?? src.kind}</span></li>)}</ul>
                {i.verification.notes.length > 0 && <p className="mt-1 opacity-80">{i.verification.notes.join(' ')}</p>}
              </details>
            </article>
          ))}
        </section>
      )}

      {view === 'decisions' && (
        <section className="flex flex-col gap-4">
          <p className="glass p-3 text-13"><b>In-role</b> picks, votes and deals are hypothetical persona role-play. <b>Personal answers</b> are voluntary and asked outside the role; they are shown separately and never mixed. Bots are {bots ? 'included' : 'left out'}.</p>
          {a.decisions.map((d) => (
            <article key={d.scenarioId} className="glass flex flex-col gap-3 p-4">
              <h2 className="font-display text-24 font-black">{d.districtName} <small className="text-13 opacity-70">· {d.rounds} round{d.rounds === 1 ? '' : 's'}</small></h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <p className="text-13 font-black">Cards played in role</p>
                  {d.picks.map((p) => <div key={p.option} className="flex items-center gap-2 text-13"><span className="w-40 truncate">{p.name}</span><RateBar r={p.rate} /></div>)}
                  <p className="mt-1 text-13 font-black">Outcome of the vote</p>
                  <div className="flex items-center gap-2 text-13"><span className="w-40">Approved</span><RateBar r={d.verdicts.approved} tone="#2f9a12" /></div>
                  <div className="flex items-center gap-2 text-13"><span className="w-40">Delayed (blocked)</span><RateBar r={d.verdicts.delayed} tone="#f0b400" /></div>
                  <div className="flex items-center gap-2 text-13"><span className="w-40">Rejected</span><RateBar r={d.verdicts.rejected} tone="#ef5a43" /></div>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-13 font-black">Yes votes by role</p>
                  {PERSONAS.map((p) => <div key={p} className="flex items-center gap-2 text-13"><span className="w-40 truncate">{PERSONA_INFO[p].name}</span><RateBar r={d.yesVotes[p]} /></div>)}
                  <p className="mt-1 text-13 font-black">Amendments</p>
                  <table className="text-13"><thead><tr className="text-left opacity-70"><th>Change</th><th>Asked</th><th>Accepted</th><th>Approved</th></tr></thead>
                    <tbody>{d.amendments.map((m) => <tr key={m.id}><td className="pr-2">{m.name}</td><td>{m.offered}</td><td>{m.accepted}</td><td>{m.approvedWith}</td></tr>)}</tbody></table>
                  {d.stanceChanges.map((c) => <p key={c.amendment} className="text-13">After <b>{c.name}</b>: {c.changed} of {c.seats} stances changed ({c.toSupport} toward support).</p>)}
                </div>
                <div className="flex flex-col gap-1 rounded-2xl bg-white/50 p-3">
                  <p className="text-13 font-black">Personal answers (outside the role) · {d.personal.answers}</p>
                  {d.personal.answers === 0 ? <p className="text-13 opacity-70">None yet.</p> : (
                    <>
                      <p className="text-13">Before the deal: {Object.entries(d.personal.before).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}</p>
                      <p className="text-13">After the result: {Object.entries(d.personal.after).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}</p>
                      <p className="text-13">Reasons: {Object.entries(d.personal.reasons).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}</p>
                      <div className="flex items-center gap-2 text-13"><span className="w-40">Amendment changed my pick</span><RateBar r={d.personal.movedByAmendment} /></div>
                      <div className="flex items-center gap-2 text-13"><span className="w-40">Same as role pick</span><RateBar r={d.personal.sameAsRolePick} /></div>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {view === 'explorer' && (
        <section className="flex flex-col gap-4">
          <p className="glass p-3 text-13">{SIM_DISCLAIMER} {a.explorer.totalPlans} plans (an option or amendment, or nothing, in each of three areas) are evaluated under three futures; {a.explorer.feasiblePlans} are feasible. Tables have built {a.explorer.distinctPlans} different plan{a.explorer.distinctPlans === 1 ? '' : 's'} so far.</p>
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {FUTURES.map((f) => <button key={f.id} type="button" role="tab" className="aero-btn !py-1 text-13" aria-pressed={future === f.id} onClick={() => setFuture(f.id)} title={f.note}>{f.name}</button>)}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-24 font-black">Plans tables built</h2>
              {a.explorer.top.length === 0 && <p className="text-13 opacity-70">No finished matches yet.</p>}
              {a.explorer.top.map((p) => {
                const f = p.outcome.byFuture.find((x) => x.future === future)!;
                return (
                  <div key={p.key} className="rounded-2xl bg-white/60 p-2 text-13">
                    <p><b>×{p.count}</b> {p.labels.join(' · ')}</p>
                    <p>Flood exposure {f.flood} · access {f.access} · cost {p.outcome.cost} · beats {Math.round(p.beats * 100)}% of feasible plans on worst case{p.outcome.feasible ? '' : ' · incomplete'}</p>
                  </div>
                );
              })}
            </section>
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-24 font-black">Contrasting feasible plans</h2>
              {a.explorer.alternatives.map((alt) => {
                const f = alt.outcome.byFuture.find((x) => x.future === future)!;
                return (
                  <div key={alt.id} className="rounded-2xl bg-white/60 p-2 text-13">
                    <p><b>{alt.title}</b> <span className="opacity-70">{alt.why}</span></p>
                    <p>{alt.outcome.key.split(' | ').join(' · ')}</p>
                    <p>Flood exposure {f.flood} · access {f.access} · cost {alt.outcome.cost}</p>
                  </div>
                );
              })}
            </section>
          </div>
          <section className="glass flex flex-col gap-1 p-4">
            <h2 className="font-display text-24 font-black">Did tables adopt what the model rates best for flood?</h2>
            {a.explorer.agreement.map((g) => <div key={g.scenarioId} className="flex items-center gap-2 text-13"><span className="w-44 truncate">{g.districtName}: {g.modelBest}</span><RateBar r={g.adopted} /></div>)}
          </section>
        </section>
      )}

      {view === 'insights' && (
        <section className="flex flex-col gap-3">
          {a.insights.length === 0 && <p className="glass p-4 text-15">Insights appear once matches have been played. Each one names its sample size and the matches behind it.</p>}
          {a.insights.map((i) => (
            <article key={i.id} className="glass flex flex-col gap-1 p-4">
              <h2 className="font-display text-20 font-black">{i.title} <span className={`chip ml-1 text-[11px] ${i.strength === 'lead' ? '' : ''}`}>{i.strength === 'lead' ? `lead · n=${i.n}` : `n=${i.n}`}</span></h2>
              <p className="text-15">{i.text}</p>
              <p className="text-[12px] opacity-70">From {i.matchIds.length} match{i.matchIds.length === 1 ? '' : 'es'}. {i.strength === 'lead' ? `Under ${MIN_N} cases: check it before relying on it.` : ''}</p>
            </article>
          ))}
          <p className="glass p-3 text-13">These are descriptions of game sessions, not of Miami Beach's population, and the simulator ranks plans on illustrative effect sizes. No plan is declared right. Game votes are not municipal approvals.</p>
        </section>
      )}
    </>
  );
}
