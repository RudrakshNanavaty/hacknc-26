// The atlas's sections. Each one answers a question a planner would ask of many matches, and every
// figure carries its sample. Nothing here is public opinion: role-play is a hypothetical, and personal
// preferences are shown on their own.
import { useState } from 'react';
import {
  INDICATOR_INFO, INDICATORS, MIN_N, PERSONA_INFO, PERSONAS, PROJECTS, districtById, rate,
  type AtlasInsights, type CrisisKind, type Indicator, type Rate,
} from '@shared';
import type { AtlasMatch } from '../api';
import { PersonaOrb } from '../game/Players';
import { HeatCell, RateBar, Stat, Strength, evidence, pct } from './parts';

const STACK = { approved: '#3f9b1c', blocked: '#c0392b', rejected: '#e8590c', delayed: '#c99a00', unfunded: '#7b8da0' } as const;

/** Approved / blocked / voted down / unfunded as one stacked bar (delayed is a flag on top of these). */
function Outcomes({ k }: { k: AtlasInsights['kinds'][number] }) {
  const n = Math.max(1, k.n);
  const segs = [
    ['approved', k.approved.k], ['blocked', k.blocked.k], ['rejected', k.rejected.k], ['unfunded', k.unfunded.k],
  ] as const;
  return (
    <span className="stack" title={segs.map(([s, v]) => `${s}: ${v}`).join(' · ')}>
      {segs.map(([s, v]) => v > 0 && <span key={s} style={{ width: `${(v / n) * 100}%`, background: STACK[s] }} />)}
    </span>
  );
}

// ---------- Overview ----------

export function EvidenceMeter({ cases }: { cases: number }) {
  const e = evidence(cases);
  const pctDone = Math.min(100, (cases / 200) * 100);
  return (
    <div className="glass flex flex-col gap-1.5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-18 font-black">How much to trust this view</span>
        <span className={`strength strength-${e.tone === 'low' ? 'indicative' : e.tone === 'mid' ? 'indicative' : 'moderate'}`}>{e.label}</span>
      </div>
      <span className="evidence-track" aria-hidden><span className="evidence-fill" style={{ width: `${pctDone}%` }} /><i style={{ left: '8%' }} /><i style={{ left: '30%' }} /></span>
      <p className="text-[12px] opacity-80">
        {cases} proposals decided in view{e.next ? `; ${e.next - cases} more before this reads as ${e.next === 16 ? 'indicative' : e.next === 60 ? 'moderate' : 'robust'}` : ''}.
        Comparisons are only called real when a significance test passes on at least {MIN_N} cases a side.
      </p>
    </div>
  );
}

export function Findings({ a, open, setOpen, goto }: { a: AtlasInsights; open: string | null; setOpen: (id: string | null) => void; goto: (tab: string) => void }) {
  if (!a.insights.length) return <p className="text-13 opacity-70">Play more matches: findings appear once a pattern rests on enough cases.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {a.insights.map((f) => (
        <li key={f.id} className="rounded-xl bg-white/55 p-2.5 text-13">
          <p className="flex flex-wrap items-center gap-2">
            <Strength s={f.strength} />
            <span className="tabular text-[11px] font-black opacity-70">{f.n} cases</span>
          </p>
          <p className="mt-1 text-[14px] leading-snug font-semibold">{f.text}</p>
          <p className="mt-1 flex flex-wrap gap-3 text-[12px] font-bold">
            <button type="button" className="text-aqua-deep underline" onClick={() => goto(f.tab)}>See the figures</button>
            {f.refs.length > 0 && <button type="button" className="text-aqua-deep underline" onClick={() => setOpen(open === f.id ? null : f.id)}>{f.refs.length} source match{f.refs.length > 1 ? 'es' : ''}</button>}
          </p>
          {open === f.id && <code className="mt-1 block max-h-28 overflow-auto text-[11px] break-all">{f.refs.join('\n')}</code>}
        </li>
      ))}
    </ul>
  );
}

export function Trend({ a }: { a: AtlasInsights }) {
  const pts = a.trend.filter((t) => t.cases > 0);
  if (pts.length < 2) return null;
  return (
    <div className="glass flex flex-col gap-1 p-3">
      <span className="font-display text-18 font-black">Is the picture settling?</span>
      <p className="text-[12px] opacity-75">Share of proposals approved, by day played. A flat line means more matches would not change the picture.</p>
      <ul className="flex flex-col gap-1">
        {pts.map((t) => <li key={t.day} className="text-13"><span className="tabular mr-2 opacity-75">{t.day}</span><RateBar r={t.approved} /></li>)}
      </ul>
    </div>
  );
}

// ---------- Places ----------

export function Places({ a, onArea }: { a: AtlasInsights; onArea: (id: string) => void }) {
  const kinds = [...new Set(a.cells.map((c) => c.kind))];
  return (
    <div className="flex flex-col gap-4">
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">Where proposals pass and where they stall</h2>
        <p className="text-13 opacity-80">One row per area. Contested means any opposition, a block, or a condition on the table. Whiskers are 95% intervals; grey bars rest on fewer than {MIN_N} cases.</p>
        <div className="overflow-x-auto">
          <table className="studio-table">
            <thead><tr><th>Area</th><th>Proposals</th><th>Approved</th><th>Contested</th><th>Blocked by a rule</th><th>Most proposed</th><th>What stops them</th><th>Personal picks</th></tr></thead>
            <tbody>
              {a.places.map((p) => (
                <tr key={p.id}>
                  <td className="font-bold"><button type="button" className="underline" onClick={() => onArea(p.id)} title="Filter the whole atlas to this area">{p.name}</button></td>
                  <td className="tabular">{p.n}</td>
                  <td><RateBar r={p.approved} tone="#3f9b1c" /></td>
                  <td><RateBar r={p.contested} tone="#c99a00" /></td>
                  <td><RateBar r={p.blocked} tone="#c0392b" /></td>
                  <td className="text-13">{p.mix.slice(0, 2).map((m) => `${PROJECTS[m.kind].name} (${m.n})`).join(', ') || 'n/a'}</td>
                  <td className="text-[12px]">{p.topRules.map((r) => `${r.label} (${r.count})`).join('; ') || 'n/a'}</td>
                  <td className="tabular">{p.preferred}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">Which projects work where</h2>
        <p className="text-13 opacity-80">Approval rate for every project in every area, with the number of proposals behind it. Grey cells have too few to read.</p>
        {kinds.length === 0 ? <p className="text-13 opacity-70">No proposals yet.</p> : (
          <div className="overflow-x-auto">
            <table className="heat-table">
              <thead><tr><th />{a.places.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
              <tbody>
                {kinds.map((kind) => (
                  <tr key={kind}>
                    <th scope="row">{PROJECTS[kind].name}</th>
                    {a.places.map((p) => <HeatCell key={p.id} r={a.cells.find((c) => c.district === p.id && c.kind === kind)?.approved ?? null} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Projects, concessions, rules ----------

export function Projects({ a }: { a: AtlasInsights }) {
  const stoppedTotal = a.rules[0]?.share.n ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">How each kind of project fares</h2>
        <p className="flex flex-wrap gap-3 text-[12px]">
          {(['approved', 'blocked', 'rejected', 'unfunded'] as const).map((s) => <span key={s}><i className="swatch" style={{ background: STACK[s] }} />{s === 'rejected' ? 'voted down' : s}</span>)}
        </p>
        <div className="overflow-x-auto">
          <table className="studio-table">
            <thead><tr><th>Project</th><th>Proposals</th><th>Outcome mix</th><th>Approved</th><th>Held over</th><th>Support vs opposition</th><th>Passed with conditions</th><th>Top stopper</th></tr></thead>
            <tbody>
              {a.kinds.map((k) => (
                <tr key={k.kind}>
                  <td className="font-bold">{k.name}</td>
                  <td className="tabular">{k.n}</td>
                  <td><Outcomes k={k} /></td>
                  <td><RateBar r={k.approved} tone="#3f9b1c" /></td>
                  <td><RateBar r={k.delayed} tone="#c99a00" /></td>
                  <td className="tabular text-13">{k.meanSupport?.toFixed(1) ?? 'n/a'} vs {k.meanOpposition?.toFixed(1) ?? 'n/a'}</td>
                  <td><RateBar r={k.conditioned} tone="#0a7bb8" /></td>
                  <td className="text-[12px]">{k.topRule ? `${k.topRule.label} (${k.topRule.count})` : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">What giving something up buys</h2>
        <p className="text-13 opacity-80">Concessions put on the table, whether they were taken, and how often the proposal then passed, against the same kinds of project when no such deal was offered.</p>
        {a.concessions.length === 0 ? <p className="text-13 opacity-70">No concessions offered yet.</p> : (
          <div className="overflow-x-auto">
            <table className="studio-table">
              <thead><tr><th>Concession</th><th>Offered</th><th>Taken</th><th>Passed if taken</th><th>Passed if refused</th><th>Passed if never offered</th><th>Effect of taking it</th></tr></thead>
              <tbody>
                {a.concessions.map((c) => (
                  <tr key={c.kind}>
                    <td className="font-bold">{c.title}</td>
                    <td className="tabular">{c.offered}</td>
                    <td><RateBar r={c.accepted} tone="#0a7bb8" /></td>
                    <td><RateBar r={c.passAccepted} tone="#3f9b1c" /></td>
                    <td><RateBar r={c.passRefused} tone="#c0392b" /></td>
                    <td><RateBar r={c.passNone} tone="#7b8da0" /></td>
                    <td className="text-13 font-bold">
                      {c.lift === null ? 'n/a' : `${c.lift >= 0 ? '+' : ''}${Math.round(c.lift * 100)} points`}
                      <span className={`ml-1 strength strength-${c.significant ? 'moderate' : 'indicative'}`}>{c.significant ? 'significant' : 'not yet significant'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">Rule friction: regulation versus people</h2>
        <p className="text-13 opacity-80">Why proposals that did not pass were stopped ({stoppedTotal} in view). Regulatory rules are zoning and FEMA limits; social ones are opposition, petitions and refused deals.</p>
        {a.rules.length === 0 ? <p className="text-13 opacity-70">Nothing has been stopped yet.</p> : (
          <ul className="flex flex-col gap-2">
            {a.rules.map((r) => (
              <li key={r.rule} className="rounded-xl bg-white/55 p-2.5">
                <p className="flex flex-wrap items-center gap-2 text-13">
                  <span className={`strength ${r.type === 'regulatory' ? 'strength-strong' : 'strength-indicative'}`}>{r.type === 'regulatory' ? 'Regulatory' : 'Social'}</span>
                  <b>{r.label}</b>
                  <span className="tabular opacity-70">{r.count} proposals</span>
                </p>
                <p className="mt-1"><RateBar r={r.share} tone={r.type === 'regulatory' ? '#c0392b' : '#c99a00'} /></p>
                <p className="mt-1 text-[12px] opacity-80">
                  Most in {r.places.map((p) => `${p.name} (${p.count})`).join(', ')}. Mostly hits {r.kinds.map((k) => `${PROJECTS[k.kind].name} (${k.count})`).join(', ')}.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Scenarios ----------

const CHANGE_COLOR = (v: number) => (v >= 0 ? '#3f9b1c' : '#c0392b');

export function Scenarios({ a, onScenario }: { a: AtlasInsights; onScenario: (k: CrisisKind) => void }) {
  if (!a.scenarios.length) return <p className="glass p-4 text-13">No matches yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="glass p-3 text-13">
        The same table behaves differently when the crisis changes. This is what a survey cannot ask: how the same people trade off under flooding, a storm, a budget squeeze.
        The difference column compares approval under each crisis with approval under all the others.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {a.scenarios.map((s) => (
          <section key={s.kind} className="glass flex flex-col gap-2 p-4">
            <h2 className="flex flex-wrap items-center justify-between gap-2 font-display text-24 font-black">
              {s.label}
              <button type="button" className="aero-btn !py-1 text-[12px]" onClick={() => onScenario(s.kind)}>Filter the atlas to this</button>
            </h2>
            <p className="text-13">{s.matches} matches · {s.cases} proposals</p>
            <RateBar r={s.approved} tone="#3f9b1c" />
            <p className="text-13 font-bold">
              {s.lift === null ? 'No comparison yet' : `${s.lift >= 0 ? '+' : ''}${Math.round(s.lift * 100)} points against the other crises`}
              <span className={`ml-1 strength strength-${s.significant ? 'moderate' : 'indicative'}`}>{s.significant ? 'significant' : 'not yet significant'}</span>
            </p>
            <p className="text-[11px] font-black tracking-wide uppercase opacity-70">What gets proposed</p>
            <ul className="flex flex-col gap-1">
              {s.mix.slice(0, 5).map((m) => (
                <li key={m.kind} className="bar-row">
                  <span className="truncate text-13">{PROJECTS[m.kind].name}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${m.share * 100}%`, background: '#0a7bb8' }} /></span>
                  <span className="tabular text-13 font-bold">{Math.round(m.share * 100)}%</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] font-black tracking-wide uppercase opacity-70">Average change in the city over a round</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              {INDICATORS.map((i: Indicator) => {
                const v = s.meanChange[i];
                return (
                  <span key={i} className="text-13 font-bold tabular" style={{ color: v === null ? undefined : CHANGE_COLOR(v) }}>
                    {INDICATOR_INFO[i].short} {v === null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
                  </span>
                );
              })}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------- Stakeholders ----------

export function Stakeholders({ a }: { a: AtlasInsights }) {
  const cell = (actor: string, owner: string) => a.alliances.find((x) => x.actor === actor && x.owner === owner);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {a.stakeholders.map((s) => (
          <section key={s.persona} className="glass flex flex-col gap-2 p-4">
            <h2 className="flex items-center gap-2 font-display text-24 font-black"><PersonaOrb persona={s.persona} size={34} />{s.name}</h2>
            <p className="text-13">{s.proposals} proposals made · approved</p>
            <RateBar r={s.approved} tone="#3f9b1c" />
            <p className="text-13">Backed <b>{s.back}</b>, opposed <b>{s.oppose}</b>, funded <b>{s.fund}</b> other people’s proposals; played <b>{s.supportCards}</b> support and <b>{s.oppositionCards}</b> opposition cards.</p>
            <p className="text-13">Accepts the deals offered to them</p>
            <RateBar r={s.deals} tone="#0a7bb8" />
            <p className="text-13">Wins the match</p>
            <RateBar r={s.wins} tone="#c99a00" />
            <p className="text-[12px] opacity-75">Mean score {s.meanScore === null ? 'n/a' : s.meanScore.toFixed(1)}</p>
          </section>
        ))}
      </div>
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">Who helps and who hinders whom</h2>
        <p className="text-13 opacity-80">Each cell: how often the player in the row hindered the proposals of the column’s stakeholder (opposed them, or played an opposition card on them), across all the times they acted on one.</p>
        <div className="overflow-x-auto">
          <table className="heat-table">
            <thead><tr><th>Acts on →</th>{PERSONAS.map((p) => <th key={p}>{PERSONA_INFO[p].name}</th>)}</tr></thead>
            <tbody>
              {PERSONAS.map((actor) => (
                <tr key={actor}>
                  <th scope="row">{PERSONA_INFO[actor].name}</th>
                  {PERSONAS.map((owner) => {
                    const c = cell(actor, owner);
                    if (actor === owner) return <td key={owner} className="heat-cell is-empty">·</td>;
                    // Hinder rate: high is adversarial, so invert the colour scale (green = helps).
                    const r: Rate | null = c ? rate(c.n - c.hindered, c.n) : null;
                    return <HeatCell key={owner} r={r} show={c ? `${Math.round((c.hinder.p ?? 0) * 100)}% hinder` : undefined} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------- Outcomes ----------

export function CityOutcomes({ a }: { a: AtlasInsights }) {
  const o = a.outcomes;
  const range = (i: Indicator) => {
    const v = o.indicators[i];
    const scale = i === 'budget' ? 60 : 100;
    const at = (x: number | null) => `${Math.min(100, Math.max(0, ((x ?? 0) / scale) * 100))}%`;
    return (
      <li key={i} className="grid grid-cols-[7rem_1fr_9rem] items-center gap-2 text-13">
        <span className="font-bold">{INDICATOR_INFO[i].label}</span>
        <span className="dist-track" title={`start ${v.start} · 10th ${v.p10?.toFixed(0)} · median ${v.p50?.toFixed(0)} · 90th ${v.p90?.toFixed(0)}`}>
          {v.p10 !== null && v.p90 !== null && <span className="dist-range" style={{ left: at(v.p10), width: `${((v.p90 - v.p10) / scale) * 100}%` }} />}
          {v.p50 !== null && <span className="dist-med" style={{ left: at(v.p50) }} />}
          <span className="dist-start" style={{ left: at(v.start) }} />
        </span>
        <span className="tabular text-[12px]">{v.mean === null ? 'n/a' : `median ${v.p50?.toFixed(0)} (start ${v.start})`}</span>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">How the cities came out</h2>
        <p className="text-13">{o.completed} finished matches. Cities still viable at the end:</p>
        <RateBar r={o.viable} tone="#3f9b1c" />
        <p className="text-[12px] opacity-75">Bars show the 10th to 90th percentile of end-of-match values, the tick is the median, the marker is where the city started.</p>
        {o.completed === 0 ? <p className="text-13 opacity-70">No finished matches yet.</p> : <ul className="mt-1 flex flex-col gap-2">{INDICATORS.map(range)}</ul>}
      </section>
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">What viable cities built</h2>
        <p className="text-13 opacity-80">Average number of approved projects per finished match, in cities that ended viable and in cities that did not. A pattern to investigate, not a causal claim.</p>
        {o.completed === 0 || o.drivers.length === 0 ? <p className="text-13 opacity-70">Not enough finished matches yet.</p>
          : o.viable.k === o.viable.n || o.viable.k === 0 ? (
            <p className="text-13 opacity-80">
              {o.viable.k === o.viable.n ? 'Every finished city stayed viable' : 'No finished city stayed viable'}, so there is no contrast to read here yet.
              Viability is a pass or fail; if it does not separate matches, a graded measure (the indicator ranges above) says more.
            </p>
          ) : (
          <table className="studio-table">
            <thead><tr><th>Project</th><th>Viable cities</th><th>Cities that failed</th><th>Difference</th></tr></thead>
            <tbody>
              {o.drivers.map((d) => (
                <tr key={d.kind}><td className="font-bold">{d.name}</td><td className="tabular">{d.viable.toFixed(1)}</td><td className="tabular">{d.notViable.toFixed(1)}</td><td className="tabular font-bold" style={{ color: CHANGE_COLOR(d.diff) }}>{d.diff >= 0 ? '+' : ''}{d.diff.toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ---------- Preferences ----------

export function Preferences({ a, question }: { a: AtlasInsights; question: string }) {
  const max = Math.max(1, ...a.preferences.map((p) => Math.max(p.inRole, p.personal)));
  return (
    <div className="flex flex-col gap-4">
      <p className="glass p-3 text-13">
        <b>Kept apart on purpose.</b> Proposals in role are hypothetical persona play. Personal picks answer “{question}” once the match is over, outside the role.
        Neither is a representative poll; together they show where the role and the person diverge.
      </p>
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">Proposed in role vs personally picked</h2>
        <p className="flex gap-3 text-[12px]"><span><i className="swatch" style={{ background: '#0a7bb8' }} />In role</span><span><i className="swatch" style={{ background: '#e8590c' }} />Personally picked</span></p>
        <ul className="flex flex-col gap-2">
          {a.preferences.slice(0, 14).map((p) => (
            <li key={p.label} className="text-13">
              <span className="block truncate">{p.label}</span>
              <span className="bar-row !grid-cols-[1fr_auto]"><span className="bar-track"><span className="bar-fill" style={{ width: `${(p.inRole / max) * 100}%`, background: '#0a7bb8' }} /></span><span className="tabular font-bold">{p.inRole}</span></span>
              <span className="bar-row !grid-cols-[1fr_auto]"><span className="bar-track"><span className="bar-fill" style={{ width: `${(p.personal / max) * 100}%`, background: '#e8590c' }} /></span><span className="tabular font-bold">{p.personal}</span></span>
            </li>
          ))}
          {!a.preferences.length && <li className="text-13 opacity-70">No answers yet.</li>}
        </ul>
      </section>
      <section className="glass flex flex-col gap-2 p-4">
        <h2 className="font-display text-24 font-black">Do people pick what they proposed?</h2>
        <p className="text-13 opacity-80">Share of players whose personal pick was the project they put forward in role.</p>
        {a.roleGap.length === 0 ? <p className="text-13 opacity-70">No answers yet.</p> : (
          <ul className="flex flex-col gap-2">
            {a.roleGap.map((g) => <li key={g.persona} className="grid grid-cols-[9rem_1fr] items-center gap-2 text-13"><b>{g.name}</b><RateBar r={g.sameAsProposed} tone="#e8590c" /></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- Matches ----------

export function MatchList({ matches, selected, onSelect }: { matches: AtlasMatch[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="flex max-h-[560px] flex-col gap-2 overflow-auto">
      {matches.map((m) => (
        <li key={m.id}>
          <button type="button" className={`match-row ${selected === m.id ? 'is-on' : ''}`} onClick={() => onSelect(m.id)}>
            <span className="flex -space-x-2">{m.players.map((p) => <PersonaOrb key={p.seat} persona={p.persona} size={26} dim={p.participant === 'bot'} />)}</span>
            <span className="min-w-0 flex-1 text-left text-13">
              <b>Room {m.roomCode}</b> · {new Date(m.startedAt).toLocaleString()}<br />
              <span className="opacity-75">
                {m.sessionKind} · {m.rounds}/3 rounds · {m.approved} approved, {m.stopped} stopped
                {m.viable === null ? '' : m.viable ? ' · city viable' : ' · city failed'}
              </span>
              {m.stories.length > 0 && <span className="block truncate text-[11px] opacity-70">{m.stories.map((s) => s.title).join(' · ')}</span>}
            </span>
          </button>
        </li>
      ))}
      {!matches.length && <li className="text-13 opacity-70">No matches yet.</li>}
    </ul>
  );
}

export function DecisionLog({ rows, total, offset, onPage }: { rows: import('../api').DecisionRow[]; total: number; offset: number; onPage: (offset: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="glass flex flex-col gap-2 p-4">
      <h2 className="flex flex-wrap items-center justify-between gap-2 font-display text-24 font-black">
        Decision log
        <button type="button" className="aero-btn !py-1 text-13" onClick={() => setOpen(!open)}>{open ? 'Hide' : `Show ${total} decisions`}</button>
      </h2>
      <p className="text-13 opacity-80">Every card played, negotiation move, outcome and personal pick, with its place and crisis: the fine-grained record behind every figure.</p>
      {open && (
        <>
          <div className="overflow-x-auto">
            <table className="studio-table">
              <thead><tr><th>When</th><th>Round</th><th>Crisis</th><th>Who</th><th>Record</th><th>What</th><th>Where</th><th>Result</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="tabular text-[12px]">{new Date(d.at).toLocaleTimeString()}</td>
                    <td className="tabular">{d.round ?? ''}</td>
                    <td className="text-[12px]">{d.crisis ?? ''}</td>
                    <td className="text-[12px]">{d.persona ?? ''}{d.participant === 'bot' ? ' (bot)' : ''}</td>
                    <td className="text-[12px]">{d.kind}</td>
                    <td className="text-[12px]">{d.card ?? d.project ?? ''}</td>
                    <td className="text-[12px]">{d.district ? districtById(d.district).name : ''}</td>
                    <td className="text-[12px]">{d.status ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-13">
            <button type="button" className="aero-btn !py-1" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - rows.length))}>Newer</button>
            <span className="tabular">{offset + 1} to {offset + rows.length} of {total}</span>
            <button type="button" className="aero-btn !py-1" disabled={offset + rows.length >= total} onClick={() => onPage(offset + rows.length)}>Older</button>
          </div>
        </>
      )}
    </section>
  );
}

export { Stat, pct };
