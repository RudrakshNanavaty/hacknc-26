// Research Mode: what players built, as experiment records a researcher can inspect and re-run.
import { useEffect, useState } from 'react';
import { REEFS, REFERENCE_TILES, materialOf, reefById, type ReefId } from '@shared';
import { recentExperiments, type ExperimentRow } from '../api';
import { Link } from '../router';
import { ResultLine } from '../ui/ResultLine';
import { button } from '../workshop/Workshop';

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
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className={button}>Back to the ocean</Link>
        <h1 className="font-display text-48 font-extrabold">Research Mode</h1>
      </div>

      <label className="flex items-center gap-2 text-15">
        Reef
        <select value={reef} onChange={(e) => setReef(e.target.value as ReefId)} className="border-(length:--rule) border-ink bg-bond px-2 py-1">
          {REEFS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>

      <section className="border-(length:--rule) border-ink bg-bond p-4 shadow-plate">
        <h2 className="font-display text-32 font-extrabold">Reference tiles</h2>
        <ul className="mt-2 space-y-1 text-15">
          {REFERENCE_TILES.map((t) => (
            <li key={t.id}>
              <span className="font-semibold">{t.name}</span> · {materialOf(t.design)} voxels · {t.source}
              {t.note && <span className="italic"> ({t.note})</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-(length:--rule) border-ink bg-bond p-4 shadow-plate">
        <h2 className="font-display text-32 font-extrabold">Experiments at {reefById(reef).name}</h2>
        {data === 'loading' && <p className="mt-2 text-15">Loading…</p>}
        {data === null && <p className="mt-2 text-15">The server did not answer.</p>}
        {data && data !== 'loading' && (
          <>
            <p className="mt-1 text-13">Stored in {data.store === 'tiger' ? 'Tiger Data' : 'memory (no DATABASE_URL)'}.</p>
            {data.experiments.length === 0 ? (
              <p className="mt-2 text-15">No experiments yet. Run one from the reef's card.</p>
            ) : (
              <ol className="mt-2 space-y-2 text-15">
                {data.experiments.map((e) => (
                  <li key={e.id} className="border-t border-ink pt-2">
                    <span className="font-semibold">{e.playerName}</span>
                    {e.roomCode && <> in room {e.roomCode}</>} · {new Date(e.createdAt).toLocaleString()}
                    <br />
                    <ResultLine result={e.result} /> · model {e.result.model}{' '}
                    <a className="underline" href={`/api/experiments/${e.id}`} target="_blank" rel="noreferrer">Export JSON</a>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </main>
  );
}
