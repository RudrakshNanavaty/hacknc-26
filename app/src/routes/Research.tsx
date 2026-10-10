// Research Mode: what players built, as experiment records a researcher can inspect, export and
// re-run (design + reef conditions + seed + model version).
import { useEffect, useState } from 'react';
import { REEFS, REFERENCE_TILES, designToStl, materialOf, reefById, type ReefId } from '@shared';
import { recentExperiments, type ExperimentRow } from '../api';
import { Link } from '../router';
import { Bubbles } from '../ui/Bubbles';
import { ResultLine } from '../ui/ResultLine';
import { Icon } from '../workshop/Icons';

function downloadStl(e: ExperimentRow) {
  const url = URL.createObjectURL(new Blob([designToStl(e.design, `experiment ${e.id}`)], { type: 'model/stl' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `reefforge-${e.id.slice(0, 8)}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Research() {
  const [reef, setReef] = useState<ReefId>('kaneohe');
  const [data, setData] = useState<{ store: string; experiments: ExperimentRow[] } | null | 'loading'>('loading');

  useEffect(() => {
    let live = true;
    setData('loading');
    recentExperiments(reef).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [reef]);

  return (
    <main className="relative min-h-full overflow-hidden">
      <Bubbles count={12} seed={19} />
      <div className="relative mx-auto flex max-w-5xl flex-col gap-4 p-3 sm:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <Link to="/" className="btn">{Icon.back}<span>Ocean</span></Link>
          <h1 className="font-display text-48 font-bold text-white drop-shadow-[0_2px_6px_rgba(0,50,90,0.5)]">Research Mode</h1>
        </header>

        <section className="glass p-5">
          <label className="flex flex-wrap items-center gap-2 font-bold">
            Reef
            <select value={reef} onChange={(e) => setReef(e.target.value as ReefId)} className="field">
              {REEFS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <p className="mt-2 text-15">
            Every test stores the design, the reef’s conditions, the seed and the model version, so it can be re-run exactly.
            Today’s model is the <b>prototype flow</b> (water slows near surfaces; larvae swim and drift). Settlement needs the validated engine and shows as pending.
          </p>
        </section>

        <section className="glass p-5">
          <h2 className="font-display text-24 font-bold">Reference tiles</h2>
          <ul className="mt-2 space-y-1.5 text-15">
            {REFERENCE_TILES.map((t) => (
              <li key={t.id}>
                <b>{t.name}</b> <span className={`chip ${t.kind === 'published' ? 'chip-published' : 'chip-game'}`}>{t.kind === 'published' ? 'Published' : 'Game-made'}</span>
                {' '}· {materialOf(t.design).toLocaleString()} voxels · {t.source}
                {t.note && <span className="italic"> ({t.note})</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="glass p-5">
          <h2 className="font-display text-24 font-bold">Experiments at {reefById(reef).name}</h2>
          {data === 'loading' && <p className="mt-2">Loading…</p>}
          {data === null && <p className="mt-2">The server did not answer.</p>}
          {data && data !== 'loading' && (
            <>
              <p className="mt-1 text-13">Stored in {data.store === 'tiger' ? 'Tiger Data' : 'memory (set DATABASE_URL for Tiger Data)'}.</p>
              {data.experiments.length === 0 ? (
                <p className="mt-3">No experiments yet. Dive in and release some larvae.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {data.experiments.map((e) => (
                    <li key={e.id} className="rounded-2xl bg-white/50 p-3 text-15">
                      <p>
                        <b>{e.playerName}</b>
                        {e.roomCode && <> · room {e.roomCode}</>} · {new Date(e.createdAt).toLocaleString()} · {e.design.pieces?.length ?? 0} pieces · model {e.result.model}
                      </p>
                      <p className="mt-0.5"><ResultLine result={e.result} /></p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a className="btn" href={`/api/experiments/${e.id}`} target="_blank" rel="noreferrer">Record (JSON)</a>
                        <button className="btn" disabled={!e.design.solid.length} onClick={() => downloadStl(e)}>Mesh (STL)</button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
