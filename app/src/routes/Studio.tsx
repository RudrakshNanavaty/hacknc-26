// Planning Studio: what the matches add up to, on the real map. Every number here is computed from
// saved records (shared/src/game/record.ts), every finding lists the records it comes from, and
// demo sessions, bots and community sessions are kept apart.
import { useEffect, useMemo, useState } from 'react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import {
  CARDS, COMBOS, PERSONA_INFO, PROJECTS, districtById, replayMatch, startCity, type MatchRecord, type SessionKind,
} from '@shared';
import { brief as fetchBrief, match as fetchMatch, studio as fetchStudio, type StudioData } from '../api';
import { CityMap } from '../map/CityMap';
import { Link } from '../router';
import { STATUS_STYLE, deltaText } from '../game/format';
import { PersonaOrb } from '../game/Players';

const CITY = startCity();
/** Two-series palette (validated: CVD ΔE 21.8, contrast >= 3:1 on white). */
const IN_ROLE = '#0a7bb8';
const PERSONAL = '#e8590c';

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="glass flex flex-col p-3">
      <span className="text-13 font-bold opacity-75">{label}</span>
      <span className="font-display text-32 leading-none font-black tabular">{value}</span>
      {note && <span className="mt-1 text-[12px] opacity-70">{note}</span>}
    </div>
  );
}

/** A horizontal bar list: one series, one hue, values written in ink. */
function Bars({ rows, color = IN_ROLE }: { rows: { label: string; value: number; title?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-13 opacity-70">Nothing recorded yet.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="bar-row" title={r.title ?? `${r.label}: ${r.value}`}>
          <span className="truncate text-13">{r.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
          <span className="tabular text-13 font-bold">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ m }: { m: MatchRecord }) {
  const name = (seat: number) => m.players.find((p) => p.seat === seat);
  const replay = useMemo(() => replayMatch(m), [m]);
  return (
    <ol className="flex flex-col gap-3">
      <li className={`rounded-2xl p-2 text-13 font-bold ${!replay.comparable ? 'bg-white/60' : replay.matches ? 'bg-leaf/20' : 'bg-coral/20'}`}>
        {!replay.comparable
          ? `Replay check skipped: ${replay.reason}`
          : replay.matches ? '✓ Replay check: the engine reproduces this match from the record alone (no AI calls).' : `⚠ Replay differs: ${replay.mismatches.join(', ')}`}
      </li>
      {m.rounds.map((r) => (
        <li key={r.round} className="rounded-2xl bg-white/60 p-3">
          <p className="font-display text-18 font-black">Round {r.round} · {typeof r.crisis === 'string' ? (r.crisis as string).replace('-', ' ') : r.crisis.title}</p>
          <p className="text-13 italic">“{r.headline}”</p>
          {r.director?.event && (
            <p className="mt-1 rounded-xl bg-lilac/20 p-2 text-13">
              🎲 <b>Game event (fictional):</b> {r.director.event.title}, {districtById(r.director.event.district).name}, magnitude {r.director.event.magnitude} · {deltaText(r.director.event.delta)}
              <span className="chip ml-1 text-[11px]">{r.director.event.source === 'gemini' ? 'AI-proposed, rules-checked' : 'authored'}</span>
            </p>
          )}
          {(r.combos ?? []).map((c) => <p key={c.combo + c.district} className="text-13">✨ Combo: {COMBOS[c.combo].name}, {districtById(c.district).name}</p>)}
          {r.director && r.director.hints.length > 0 && (
            <p className="text-[12px] opacity-80">💡 Table hints: {r.director.hints.length} shown ({r.director.hints.filter((h) => h.source === 'gemini').length} AI-worded), {r.director.hints.filter((h) => h.followed).length} followed by a player.</p>
          )}
          <ul className="mt-2 flex flex-col gap-1 text-13">
            {r.proposals.filter((p) => !p.carried).map((p) => <li key={p.id}>🃏 {name(p.seat)?.name} ({PERSONA_INFO[p.persona].name}) proposed {PROJECTS[p.kind].name} in {districtById(p.district).name}</li>)}
            {r.attachments.map((a) => <li key={a.seat}>🃏 {name(a.seat)?.name} played {CARDS[a.card].name} in {districtById(a.district).name}</li>)}
            {r.actions.map((a) => <li key={a.seat}>🤝 {name(a.seat)?.name} {a.move === 'back' ? 'backed' : a.move === 'oppose' ? 'opposed' : 'funded'} {a.proposalId}</li>)}
            {r.compromises.map((c) => <li key={c.id}>⚖️ {c.title}: {c.accepted ? 'accepted' : 'refused'}</li>)}
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

export function Studio() {
  const [session, setSession] = useState<SessionKind | 'all'>('all');
  const [bots, setBots] = useState(false);
  const [data, setData] = useState<StudioData | null | 'loading'>('loading');
  const [brief, setBrief] = useState<{ brief: string; source: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('match'));
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [openFinding, setOpenFinding] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => fetchStudio(session, bots).then((d) => live && setData(d));
    void load();
    const t = setInterval(load, 5000);
    fetchBrief(session).then((b) => live && setBrief(b));
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [session, bots]);

  useEffect(() => {
    if (!selected) return setRecord(null);
    fetchMatch(selected).then(setRecord);
  }, [selected, data !== 'loading' && data?.summary.matches]);

  const s = data && data !== 'loading' ? data.summary : null;

  // Hotspots: a ring per area, sized by contested proposals.
  useEffect(() => {
    if (!map || !s) return;
    const markers = s.districts.filter((d) => d.proposals > 0).map((d) => {
      const el = document.createElement('div');
      const size = 26 + 14 * Math.sqrt(d.contested);
      el.className = 'hotspot';
      el.style.width = el.style.height = `${size}px`;
      el.title = `${d.name}: ${d.contested} contested of ${d.proposals} proposals`;
      return new Marker({ element: el }).setLngLat(d.center).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, s]);

  const chipNote = useMemo(() => (id: string) => {
    const d = s?.districts.find((x) => x.id === id);
    return d && d.proposals ? `${d.proposals} proposals · ${d.contested} contested · ${d.preferred} preferred` : null;
  }, [s]);

  return (
    <main className="relative mx-auto flex min-h-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="font-display text-18 font-black text-aqua-deep">🌊 Coastal Clash</Link>
          <h1 className="hero-title font-display text-48 leading-none font-black">Planning Studio</h1>
          <p className="text-15 font-bold text-ink">Every match as geographically linked planning feedback, Miami Beach.</p>
        </div>
        <div className="glass flex flex-wrap items-center gap-2 p-2">
          {(['all', 'community', 'demo'] as const).map((k) => (
            <button key={k} type="button" className="aero-btn !py-1 text-13" aria-pressed={session === k} onClick={() => setSession(k)}>
              {k === 'all' ? 'All sessions' : k === 'community' ? 'Community' : 'Demo / playtest'}
            </button>
          ))}
          <label className="flex items-center gap-1 px-2 text-13 font-bold"><input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} /> Include bots</label>
        </div>
      </header>

      <p className="glass p-3 text-13">
        <b>Read with care:</b> card plays are <i>hypothetical persona role-play</i>, not public opinion. Personal preferences come from the end-of-match question, asked outside the role. Sessions are labelled <b>demo</b> (demonstration participants) or <b>community</b> (real community respondents); bots are {bots ? 'included' : 'left out'}.
      </p>

      {data === 'loading' && <p className="glass p-6 text-18">Loading records…</p>}
      {data === null && <p className="glass p-6 text-18">The studio could not reach the server.</p>}
      {s && data && data !== 'loading' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Matches" value={s.matches} note={`${s.completed} completed`} />
            <Stat label="Community sessions" value={s.sessions.community} note={`${s.sessions.demo} demo`} />
            <Stat label="Human participants" value={s.participants.human} note={`${s.participants.bot} bot seats`} />
            <Stat label="Personal preferences" value={s.responses} />
            <Stat label="Store" value={data.store === 'tiger' ? 'Tiger Data' : 'Memory'} note={data.rulesVersion} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="glass relative h-[520px] overflow-hidden p-0">
              <CityMap city={CITY} overlays={{ flood: true, zoning: false }} chipNote={chipNote} onReady={setMap} padding={{ top: 60, bottom: 40, left: 30, right: 30 }} />
              <p className="absolute top-3 left-3 glass px-3 py-1 text-13 font-bold">Hotspots: rings grow with contested proposals</p>
            </section>
            <section className="glass flex flex-col gap-3 p-4">
              <h2 className="font-display text-24 font-black">Findings</h2>
              {brief && <p className="rounded-2xl bg-white/60 p-3 text-15">{brief.brief} <span className="chip ml-1 text-[11px]">{brief.source === 'gemini' ? 'Gemini summary of the findings below' : 'computed'}</span></p>}
              <ul className="flex flex-col gap-2">
                {s.findings.map((f, i) => (
                  <li key={i} className="rounded-xl bg-white/50 p-2 text-13">
                    {f.text}
                    {f.refs.length > 0 && (
                      <button type="button" className="ml-1 text-[12px] font-bold text-aqua-deep underline" onClick={() => setOpenFinding(openFinding === i ? null : i)}>
                        {f.refs.length} source record{f.refs.length > 1 ? 's' : ''}
                      </button>
                    )}
                    {openFinding === i && <code className="mt-1 block max-h-28 overflow-auto text-[11px] break-all">{f.refs.join('\n')}</code>}
                  </li>
                ))}
                {!s.findings.length && <li className="text-13 opacity-70">Play a match to see findings here.</li>}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2">
                <a className="aero-btn aero-btn-aqua !py-1 text-13" href={`/api/studio/export.csv?session=${session}`}>Export CSV</a>
                <a className="aero-btn !py-1 text-13" href={`/api/studio/export.geojson?session=${session}`}>GeoJSON</a>
                <a className="aero-btn !py-1 text-13" href={`/api/studio/export.json?session=${session}`}>JSON</a>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-18 font-black">Cards played</h2>
              <Bars rows={s.cards.map((c) => ({ label: `${CARDS[c.card].art} ${c.name}`, value: c.plays }))} />
            </section>
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-18 font-black">Most common objections</h2>
              <Bars rows={s.objections.map((o) => ({ label: o.label, value: o.count, title: `Rule ${o.rule}: ${o.count}` }))} />
            </section>
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-18 font-black">Compromises accepted</h2>
              <Bars rows={s.compromises.map((c) => ({ label: c.title, value: c.accepted, title: `${c.accepted} accepted of ${c.offered} offered` }))} />
              <p className="text-[12px] opacity-70">{s.compromises.map((c) => `${c.title}: ${c.accepted} of ${c.offered} offers`).join(' · ') || ' '}</p>
            </section>
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-18 font-black">Proposed in role vs personally preferred</h2>
              <p className="flex gap-3 text-[12px]"><span><i className="swatch" style={{ background: IN_ROLE }} />In role</span><span><i className="swatch" style={{ background: PERSONAL }} />Personally preferred</span></p>
              <ul className="flex flex-col gap-2">
                {s.preferences.slice(0, 8).map((p) => {
                  const max = Math.max(1, ...s.preferences.map((x) => Math.max(x.inRole, x.personal)));
                  return (
                    <li key={p.label} className="text-13">
                      <span className="block truncate">{p.label}</span>
                      <span className="bar-row !grid-cols-[1fr_auto]" title={`In role: ${p.inRole}`}><span className="bar-track"><span className="bar-fill" style={{ width: `${(p.inRole / max) * 100}%`, background: IN_ROLE }} /></span><span className="tabular font-bold">{p.inRole}</span></span>
                      <span className="bar-row !grid-cols-[1fr_auto]" title={`Personally preferred: ${p.personal}`}><span className="bar-track"><span className="bar-fill" style={{ width: `${(p.personal / max) * 100}%`, background: PERSONAL }} /></span><span className="tabular font-bold">{p.personal}</span></span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-18 font-black">Combos completed</h2>
              <p className="text-[12px] opacity-70">Authored pairings in the rules (not opinion data).</p>
              <Bars rows={s.combos.map((c) => ({ label: `✨ ${COMBOS[c.combo].name}`, value: c.count }))} />
            </section>
            <section className="glass flex flex-col gap-2 border-2 border-dashed border-lilac p-4">
              <h2 className="font-display text-18 font-black">AI Game Director</h2>
              <p className="text-[12px] font-bold">Game fiction and coaching. Not public opinion, not part of the findings above.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Twists" value={s.director.twists.length} note={`${s.director.twists.filter((t) => t.source === 'gemini').length} AI-proposed, ${s.director.twists.filter((t) => t.source === 'template').length} authored`} />
                <Stat label="AI proposals" value={s.director.proposals.accepted + s.director.proposals.clamped + s.director.proposals.rejected} note={`${s.director.proposals.accepted} accepted · ${s.director.proposals.clamped} clamped · ${s.director.proposals.rejected} rejected`} />
                <Stat label="Hints shown" value={s.director.hints.shown} note={`${s.director.hints.aiWorded} AI-worded`} />
                <Stat label="Hints followed" value={s.director.hints.followed} note="a player then made that move" />
              </div>
              {s.director.twists.length > 0 && (
                <ul className="flex flex-col gap-1 text-13">
                  {s.director.twists.slice(0, 6).map((t) => <li key={`${t.matchId}-${t.round}`}>🎲 {t.title}, {districtById(t.district).name} (round {t.round}, magnitude {t.magnitude}) <span className="opacity-70">· {t.source === 'gemini' ? 'AI-proposed' : 'authored'}</span></li>)}
                </ul>
              )}
              {s.director.reviewQueue.length > 0 && (
                <div className="rounded-xl bg-white/60 p-2 text-13">
                  <p className="font-bold">Designer review queue (AI combo ideas, never played)</p>
                  <ul className="list-disc pl-5">{s.director.reviewQueue.slice(0, 5).map((q, i) => <li key={i}>{q.idea}</li>)}</ul>
                </div>
              )}
            </section>
          </div>

          <section className="glass flex flex-col gap-3 p-4">
            <h2 className="font-display text-24 font-black">Areas</h2>
            <div className="overflow-x-auto">
              <table className="studio-table">
                <thead><tr><th>Area</th><th>Lon, lat</th><th>Proposals</th><th>Contested</th><th>Approved</th><th>Blocked</th><th>Voted down</th><th>Delayed</th><th>Compromises</th><th>Preferred</th></tr></thead>
                <tbody>
                  {s.districts.map((d) => (
                    <tr key={d.id}>
                      <td className="font-bold">{d.name}</td>
                      <td className="tabular">{d.center[0].toFixed(4)}, {d.center[1].toFixed(4)}</td>
                      <td>{d.proposals}</td><td>{d.contested}</td><td>{d.status.approved}</td><td>{d.status.blocked}</td><td>{d.status.rejected}</td><td>{d.status.delayed}</td><td>{d.compromisesAccepted}</td><td>{d.preferred}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="font-display text-24 font-black">Matches</h2>
              <ul className="flex max-h-[520px] flex-col gap-2 overflow-auto">
                {data.matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" className={`match-row ${selected === m.id ? 'is-on' : ''}`} onClick={() => setSelected(m.id)}>
                      <span className="flex -space-x-2">{m.players.map((p) => <PersonaOrb key={p.seat} persona={p.persona} size={26} dim={p.participant === 'bot'} />)}</span>
                      <span className="min-w-0 flex-1 text-left text-13">
                        <b>Room {m.roomCode}</b> · {new Date(m.startedAt).toLocaleString()}<br />
                        <span className="opacity-75">{m.sessionKind} · {m.rounds}/3 rounds · {m.responses} preference{m.responses === 1 ? '' : 's'}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {!data.matches.length && <li className="text-13 opacity-70">No matches yet. <Link to="/" className="underline">Host one.</Link></li>}
              </ul>
            </section>
            <section className="glass flex flex-col gap-2 p-4">
              <h2 className="flex flex-wrap items-center justify-between gap-2 font-display text-24 font-black">Match replay{record?.final && <Link to={`/verify/${record.id}`} className="source-chip text-13">Verify on Solana</Link>}</h2>
              {record ? <Timeline m={record} /> : <p className="text-13 opacity-70">Pick a match to see its timeline: every card, negotiation move, rule and outcome.</p>}
            </section>
          </div>

          <section className="glass p-4 text-13">
            <h2 className="font-display text-18 font-black">Provenance</h2>
            <p>{data.dataMethod}</p>
            <ul className="mt-1 list-disc pl-5">
              {data.sources.map((src) => <li key={src.id}><a className="underline" href={src.layer} target="_blank" rel="noreferrer">{src.name}</a> · fetched {src.fetchedAt}</li>)}
            </ul>
            <p className="mt-1 opacity-75">Rules {data.rulesVersion} · data {data.dataVersion}. Game effects are illustrative scenario values; budgets are hypothetical.</p>
          </section>
        </>
      )}
    </main>
  );
}
