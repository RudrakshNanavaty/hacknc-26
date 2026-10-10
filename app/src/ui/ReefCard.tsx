// A reef's card: mission, the water it is tested in, live heat stress, and where every number
// comes from. Values carry their provenance (measured / published / model / game-defined).
import { useEffect, useState } from 'react';
import type { Provenance, Reef } from '@shared';
import { reefHeat, type Heat } from '../api';

const TAG: Record<Provenance, string> = {
  measured: 'Measured',
  published: 'Published',
  model: 'Ocean model',
  'game-defined': 'Game-defined',
};

export function ProvenanceTag({ p }: { p: Provenance }) {
  return <span className="border border-ink px-1 text-13 whitespace-nowrap">{TAG[p]}</span>;
}

export function ReefCard({ reef, children }: { reef: Reef; children?: React.ReactNode }) {
  const [heat, setHeat] = useState<Heat | null | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    setHeat('loading');
    reefHeat(reef.id).then((h) => live && setHeat(h));
    return () => {
      live = false;
    };
  }, [reef.id]);

  return (
    <section className="w-full max-w-md min-w-0 border-(length:--rule) border-ink bg-bond p-4 shadow-plate">
      <p className="text-13 uppercase tracking-wide">{reef.region}</p>
      <h2 className="font-display text-48 font-extrabold">{reef.name}</h2>
      <p className="mt-1 text-18 font-semibold">{reef.mission.title}</p>
      <p className="mt-1 text-15">{reef.mission.brief}</p>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-15">
        <dt className="font-semibold">Water</dt>
        <dd>
          {reef.flow ? (
            <>
              {reef.flow.kind === 'oscillating' ? `Back and forth, ${reef.flow.peakCmS} cm/s peak every ${reef.flow.periodS} s` : `Steady, ${reef.flow.peakCmS} cm/s`}{' '}
              <ProvenanceTag p={reef.flow.provenance} />
            </>
          ) : (
            'Not derived yet'
          )}
        </dd>
        <dt className="font-semibold">Heat stress</dt>
        <dd>
          {heat === 'loading' ? 'Loading…' : heat ? (
            <>
              {heat.dhw.toFixed(1)} °C-weeks on {heat.date} <ProvenanceTag p="measured" />
            </>
          ) : (
            'Unavailable right now'
          )}
        </dd>
      </dl>

      {reef.sources.length > 0 && (
        <details className="mt-3 text-13">
          <summary className="cursor-pointer font-semibold">Data sources</summary>
          <ul className="mt-1 space-y-1">
            {reef.sources.map((s) => (
              <li key={s.url}>
                <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a> <ProvenanceTag p={s.provenance} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </section>
  );
}
