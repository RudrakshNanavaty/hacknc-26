// A reef's mission card: satellite imagery of the reef, the mission, the water it is tested in,
// live heat stress, and where every number comes from (measured / published / model / game-defined).
import { useEffect, useState } from 'react';
import { reefImageUrl, type Provenance, type Reef } from '@shared';
import { reefHeat, type Heat } from '../api';

const TAG: Record<Provenance, [string, string]> = {
  measured: ['Measured', 'text-leaf-deep'],
  published: ['Published', 'text-aqua-deep'],
  model: ['Ocean model', 'text-lilac'],
  'game-defined': ['Game-defined', 'text-coral'],
};

export function ProvenanceTag({ p }: { p: Provenance }) {
  const [label, color] = TAG[p];
  return <span className={`chip bg-white/70 ${color}`}>{label}</span>;
}

export function useHeat(reefId: Reef['id']) {
  const [heat, setHeat] = useState<Heat | null | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    setHeat('loading');
    reefHeat(reefId).then((h) => live && setHeat(h));
    return () => {
      live = false;
    };
  }, [reefId]);
  return heat;
}

/** Survey imagery for reefs with a world (aligned with their terrain), else Esri World Imagery. */
const WORLD_IMAGERY: Record<string, string> = {
  'florida-keys': 'USGS SQUID-5 orthomosaic, 2021',
  'heron-island': 'Contains modified Copernicus Sentinel data 2025',
};

function CardImage({ reef }: { reef: Reef }) {
  const site = reef.world?.terrain;
  const [useWorld, setUseWorld] = useState(!!site);
  useEffect(() => setUseWorld(!!site), [site]);
  const src = useWorld && site ? `/terrain/${site}/texture.jpg` : reefImageUrl(reef);
  const credit = useWorld && site ? WORLD_IMAGERY[site] ?? 'Survey imagery' : 'Imagery © Esri, Maxar';
  return (
    <>
      <img src={src} alt={`Seabed imagery of ${reef.name}`} className="h-full w-full object-cover" loading="lazy" onError={() => setUseWorld(false)} />
      <div className="absolute inset-0 bg-gradient-to-t from-abyss/70 via-transparent to-white/20" />
      <p className="absolute bottom-2 left-4 text-13 font-bold text-white drop-shadow">{reef.region}</p>
      <p className="absolute right-3 bottom-2 text-[10px] text-white/80">{credit}</p>
    </>
  );
}

export function ReefCard({ reef, children, compact = false }: { reef: Reef; children?: React.ReactNode; compact?: boolean }) {
  const heat = useHeat(reef.id);
  return (
    <section className="glass w-full max-w-md min-w-0 overflow-hidden">
      {!compact && (
        <div className="relative h-36 overflow-hidden sm:h-44">
          <CardImage reef={reef} />
          {!reef.ready && <span className="chip absolute top-3 right-3 bg-white/85 text-aqua-deep">Coming next</span>}
        </div>
      )}
      <div className="p-4">
        {compact && <p className="text-13 font-bold text-aqua-deep">{reef.region}</p>}
        <h2 className="font-display text-32 font-black text-ink">{reef.name}</h2>
        <p className="mt-0.5 font-display text-18 font-extrabold text-aqua-deep">{reef.mission.title}</p>
        <p className="mt-1 text-15">{reef.mission.brief}</p>

        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-15">
          <dt className="font-bold">Water</dt>
          <dd>
            {reef.flow ? (
              <>
                {reef.flow.kind === 'oscillating' ? `Back and forth, ${reef.flow.peakCmS} cm/s peak every ${reef.flow.periodS} s` : `Steady, ${reef.flow.peakCmS} cm/s`}{' '}
                <ProvenanceTag p={reef.flow.provenance} />
              </>
            ) : (
              'Being derived from the site data'
            )}
          </dd>
          <dt className="font-bold">Heat stress</dt>
          <dd>
            {heat === 'loading' ? 'Checking NOAA…' : heat ? (
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
            <summary className="cursor-pointer font-bold text-aqua-deep">Data sources ({reef.sources.length})</summary>
            <ul className="mt-1 space-y-1">
              {reef.sources.map((s) => (
                <li key={s.url}>
                  <a className="underline decoration-aqua/50" href={s.url} target="_blank" rel="noreferrer">{s.label}</a> <ProvenanceTag p={s.provenance} />
                </li>
              ))}
            </ul>
          </details>
        )}
        {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  );
}
