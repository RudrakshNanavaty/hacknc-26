// Civic Atlas: what many matches add up to, on the real map. A match is one table's role-play; hundreds
// of them under different crises are a map of where proposals pass, where they stall, what concessions
// unlock them and who stands where. Every figure carries its sample size, demo sessions, bots and
// community sessions are kept apart, and role-play is never presented as public opinion.
import { useEffect, useMemo, useState } from 'react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import {
  CRISIS_KIND_INFO, CRISIS_KINDS, DISTRICTS, MIN_N, startCity, type CrisisKind, type MatchRecord, type SessionKind,
} from '@shared';
import {
  atlas as fetchAtlas, atlasBrief, atlasQueryString, decisions as fetchDecisions, match as fetchMatch,
  type AtlasData, type AtlasQuery, type DecisionRow,
} from '../api';
import { CityMap } from '../map/CityMap';
import { Link } from '../router';
import { EvidenceMeter, Findings, Trend, CityOutcomes, DecisionLog, MatchList, Places, Preferences, Projects, Scenarios, Stakeholders } from '../atlas/sections';
import { Stat, heat, pct } from '../atlas/parts';
import { Timeline } from '../atlas/Timeline';
import { PlanAtlasView } from '../atlas/PlanAtlas';

const CITY = startCity();

type Tab = 'overview' | 'places' | 'projects' | 'scenarios' | 'stakeholders' | 'outcomes' | 'preferences' | 'matches' | 'data';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'places', label: 'Places' },
  { id: 'projects', label: 'Projects and rules' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'stakeholders', label: 'Stakeholders' },
  { id: 'outcomes', label: 'City outcomes' },
  { id: 'preferences', label: 'Role and person' },
  { id: 'matches', label: 'Matches' },
  { id: 'data', label: 'Data and method' },
];
const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v);

const DAY = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'n/a');

export function Atlas() {
  const [mode, setMode] = useState<'planning' | 'legacy'>(() => (location.hash === '#legacy' ? 'legacy' : 'planning'));
  const [q, setQ] = useState<AtlasQuery>({ session: 'all', bots: false, scenario: 'all', area: 'all' });
  const [tab, setTabState] = useState<Tab>(() => {
    const h = location.hash.replace('#', '');
    return isTab(h) ? h : 'overview';
  });
  const [data, setData] = useState<AtlasData | null | 'loading'>('loading');
  const [brief, setBrief] = useState<{ brief: string; source: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('match'));
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [log, setLog] = useState<{ rows: DecisionRow[]; total: number; offset: number }>({ rows: [], total: 0, offset: 0 });

  const setTab = (t: string) => {
    if (!isTab(t)) return;
    setTabState(t);
    history.replaceState(null, '', `${location.pathname}${location.search}#${t}`);
  };

  const key = atlasQueryString(q);
  useEffect(() => {
    let live = true;
    const load = () => fetchAtlas(q).then((d) => live && setData(d));
    void load();
    const t = setInterval(load, 8000);
    setBrief(null);
    void atlasBrief(q).then((b) => live && setBrief(b));
    return () => {
      live = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!selected) return setRecord(null);
    void fetchMatch(selected).then(setRecord);
  }, [selected]);

  useEffect(() => {
    if (tab !== 'matches') return;
    void fetchDecisions(q, 0).then((d) => d && setLog(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, key]);

  const a = data && data !== 'loading' ? data.insights : null;

  // Hotspots: a disc per area, sized by proposals, coloured by how often they pass.
  useEffect(() => {
    if (!map || !a || tab !== 'overview') return;
    const markers = a.places.filter((p) => p.n > 0).map((p) => {
      const el = document.createElement('div');
      const size = 24 + 5 * Math.sqrt(p.n);
      el.className = 'hotspot';
      el.style.width = el.style.height = `${size}px`;
      el.style.background = heat(p.approved).background;
      el.style.borderColor = '#fff';
      el.title = `${p.name}: ${p.approved.k} of ${p.n} approved`;
      return new Marker({ element: el }).setLngLat(p.center).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, a, tab]);

  const chipNote = useMemo(() => (id: string) => {
    const p = a?.places.find((x) => x.id === id);
    return p && p.n ? `${p.n} proposals · ${pct(p.approved)} approved` : null;
  }, [a]);

  const filtered = q.scenario !== 'all' || q.area !== 'all';

  return (
    <main className="relative mx-auto flex min-h-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="font-display text-18 font-black text-aqua-deep">Coastal Clash</Link>
          <h1 className="atlas-title font-display text-48 leading-none font-black">Civic Atlas</h1>
          <p className="max-w-2xl text-15 font-bold text-ink">
            What many tables of residents, owners, officials and advocates do when the same coast is under pressure: decision by decision, place by place, crisis by crisis.
          </p>
        </div>
        <div className="glass flex flex-wrap items-center gap-2 p-2">
          {(['all', 'community', 'demo'] as const).map((k) => (
            <button key={k} type="button" className="aero-btn !py-1 text-13" aria-pressed={q.session === k} onClick={() => setQ({ ...q, session: k as SessionKind | 'all' })}>
              {k === 'all' ? 'All sessions' : k === 'community' ? 'Community' : 'Demo / playtest'}
            </button>
          ))}
          <label className="flex items-center gap-1 px-1 text-13 font-bold">
            Crisis
            <select className="aero-input !w-auto !py-1 text-13" value={q.scenario} onChange={(e) => setQ({ ...q, scenario: e.target.value as CrisisKind | 'all' })}>
              <option value="all">Any</option>
              {CRISIS_KINDS.map((k) => <option key={k} value={k}>{CRISIS_KIND_INFO[k].label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 px-1 text-13 font-bold">
            Area
            <select className="aero-input !w-auto !py-1 text-13" value={q.area} onChange={(e) => setQ({ ...q, area: e.target.value })}>
              <option value="all">Any</option>
              {DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 px-1 text-13 font-bold"><input type="checkbox" checked={q.bots} onChange={(e) => setQ({ ...q, bots: e.target.checked })} /> Include bots</label>
          {filtered && <button type="button" className="aero-btn !py-1 text-13" onClick={() => setQ({ ...q, scenario: 'all', area: 'all' })}>Clear filters</button>}
        </div>
      </header>

      <nav className="flex flex-wrap gap-1.5" aria-label="Which game">
        <button type="button" className="aero-btn !py-1 text-13" aria-pressed={mode === 'planning'} onClick={() => { setMode('planning'); history.replaceState(null, '', location.pathname + location.search); }}>Planning Edition</button>
        <button type="button" className="aero-btn !py-1 text-13" aria-pressed={mode === 'legacy'} onClick={() => { setMode('legacy'); history.replaceState(null, '', `${location.pathname}${location.search}#legacy`); }}>Earlier card game</button>
      </nav>
      {mode === 'planning' && <PlanAtlasView session={q.session} bots={q.bots} />}
      {mode === 'legacy' && <p className="glass p-3 text-13">
        <b>Read with care:</b> proposals are <i>hypothetical persona role-play</i>, not public opinion. Personal picks come from a separate end-of-match question.
        Sessions are labelled <b>demo</b> (demonstration or playtest) or <b>community</b>; bots are {q.bots ? 'included' : 'left out'}.
        {q.session !== 'community' && a && a.scope.sessions.demo > 0 && <> This view includes {a.scope.sessions.demo} demo session{a.scope.sessions.demo > 1 ? 's' : ''}; filter to <button type="button" className="underline" onClick={() => setQ({ ...q, session: 'community' })}>Community</button> for real respondents only.</>}
      </p>}

      {mode === 'legacy' && <nav className="flex flex-wrap gap-1.5" aria-label="Atlas sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="aero-btn !py-1 text-13" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>}

      {mode === 'legacy' && data === 'loading' && <p className="glass p-6 text-18">Loading records...</p>}
      {mode === 'legacy' && data === null && <p className="glass p-6 text-18">The atlas could not reach the server.</p>}
      {mode === 'legacy' && a && data && data !== 'loading' && (
        <>
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <Stat label="Matches" value={a.scope.matches} note={`${a.scope.completed} finished`} />
                <Stat label="Proposals decided" value={a.scope.cases} note={`${a.scope.rounds} rounds`} />
                <Stat label="Decisions logged" value={a.scope.decisions} note="cards, moves, outcomes" />
                <Stat label="Human players" value={a.scope.humanParticipants} note={`${a.scope.botSeats} bot seats`} />
                <Stat label="Real stories" value={a.scope.stories} note="civic cases played" />
                <Stat label="Sessions" value={a.scope.sessions.community} note={`${a.scope.sessions.demo} demo`} />
                <Stat label="Period" value={DAY(a.scope.first)} note={`to ${DAY(a.scope.last)}`} />
              </div>
              <EvidenceMeter cases={a.scope.cases} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
                <section className="glass relative h-[560px] overflow-hidden p-0">
                  <CityMap city={CITY} overlays={{ flood: true, zoning: false }} chipNote={chipNote} onReady={setMap} padding={{ top: 60, bottom: 40, left: 30, right: 30 }} />
                  <p className="glass absolute top-3 left-3 px-3 py-1 text-13 font-bold">Discs grow with proposals and turn green where they pass</p>
                </section>
                <section className="glass flex flex-col gap-3 p-4">
                  <h2 className="font-display text-24 font-black">What the matches add up to</h2>
                  {brief && <p className="rounded-2xl bg-white/60 p-3 text-15">{brief.brief} <span className="chip ml-1 text-[11px]">{brief.source === 'gemini' ? 'Gemini summary of the findings below' : 'computed'}</span></p>}
                  <div className="max-h-[400px] overflow-auto pr-1"><Findings a={a} open={openFinding} setOpen={setOpenFinding} goto={setTab} /></div>
                </section>
              </div>
              <Trend a={a} />
            </>
          )}

          {tab === 'places' && <Places a={a} onArea={(id) => { setQ({ ...q, area: id }); setTab('overview'); }} />}
          {tab === 'projects' && <Projects a={a} />}
          {tab === 'scenarios' && <Scenarios a={a} onScenario={(k) => { setQ({ ...q, scenario: k }); setTab('overview'); }} />}
          {tab === 'stakeholders' && <Stakeholders a={a} />}
          {tab === 'outcomes' && <CityOutcomes a={a} />}
          {tab === 'preferences' && <Preferences a={a} question={data.question} />}

          {tab === 'matches' && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
                <section className="glass flex flex-col gap-2 p-4">
                  <h2 className="font-display text-24 font-black">Matches</h2>
                  <MatchList matches={data.matches} selected={selected} onSelect={setSelected} />
                </section>
                <section className="glass flex flex-col gap-2 p-4">
                  <h2 className="flex flex-wrap items-center justify-between gap-2 font-display text-24 font-black">
                    Match replay
                    {record?.final && <Link to={`/verify/${record.id}`} className="source-chip text-13">Verify on Solana</Link>}
                  </h2>
                  {record ? <Timeline m={record} /> : <p className="text-13 opacity-70">Pick a match to see its timeline: every card, negotiation move, rule and outcome.</p>}
                </section>
              </div>
              <DecisionLog rows={log.rows} total={log.total} offset={log.offset} onPage={(o) => void fetchDecisions(q, o).then((d) => d && setLog(d))} />
            </>
          )}

          {tab === 'data' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="glass flex flex-col gap-3 p-4">
                <h2 className="font-display text-24 font-black">Take it into your own analysis</h2>
                <p className="text-13 opacity-80">Every table on this page as CSV (rates carry their counts and intervals), the decision-level data, and the geographic export. The filters above apply.</p>
                <div className="flex flex-wrap gap-2">
                  {['places', 'place_by_project', 'projects', 'scenarios', 'concessions', 'stakeholders', 'alliances', 'rules', 'insights'].map((t) => (
                    <a key={t} className="aero-btn !py-1 text-13" href={`/api/atlas/table/${t}?${key}`}>{t.replace(/_/g, ' ')} (CSV)</a>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className="aero-btn aero-btn-aqua !py-1 text-13" href={`/api/studio/export.csv?session=${q.session}`}>Every decision (CSV)</a>
                  <a className="aero-btn !py-1 text-13" href={`/api/studio/export.geojson?session=${q.session}`}>GeoJSON</a>
                  <a className="aero-btn !py-1 text-13" href={`/api/studio/export.json?session=${q.session}`}>Full records (JSON)</a>
                </div>
              </section>
              <section className="glass flex flex-col gap-2 p-4 text-13">
                <h2 className="font-display text-24 font-black">Method</h2>
                <p>{data.dataMethod}</p>
                <p>
                  A proposal is counted once, at its final outcome. Rates are shares of those proposals with a Wilson 95% interval; two groups are only called different when a
                  two-proportion test passes on at least {MIN_N} proposals each side. Findings are ranked by the evidence behind them and never state more than their numbers.
                </p>
                <p>
                  <b>No correction is made for multiple comparisons</b>: with many places, projects and crises on one page a few differences will look real by chance. Treat a single finding as a lead to check, and one that repeats across sessions or crises as evidence.
                </p>
                <p>Rules {data.rulesVersion} · data {data.dataVersion} · store {data.store}. Game effects are illustrative scenario values; budgets are hypothetical.</p>
                <ul className="mt-1 list-disc pl-5">
                  {data.sources.map((src) => <li key={src.id}><a className="underline" href={src.layer} target="_blank" rel="noreferrer">{src.name}</a> · fetched {src.fetchedAt}</li>)}
                </ul>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
