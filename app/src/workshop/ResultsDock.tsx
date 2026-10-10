// What the latest run measured, docked above the replay controls so it never covers the larvae.
// The headline numbers and the settlement state are always visible; the rest sits behind Details.
//
// Science boundary: only what the prototype flow measured is shown. Settlement stays "pending"
// until the validated engine exists.
import { useState, type ReactNode } from 'react';
import type { PrototypeMetrics, PrototypeRun } from '@shared';
import { Icon } from './Icons';

export interface TestRecord {
  n: number;
  material: number;
  metrics: PrototypeMetrics;
}

function Stat({ label, value, note, pending = false }: { label: string; value: ReactNode; note?: string; pending?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-13 font-semibold text-white/80">{label}</dt>
      <dd className={`tabular font-display text-24 leading-tight font-semibold ${pending ? 'text-coral' : ''}`}>{value}</dd>
      {note && <p className="text-13 text-white/80">{note}</p>}
    </div>
  );
}

export function ResultsDock({ run, tests, material, children }: { run: PrototypeRun; tests: TestRecord[]; material: number; children: ReactNode }) {
  const [details, setDetails] = useState(false);
  const m = run.metrics;
  const pct = (v: number) => `${Math.round((v / m.released) * 100)}%`;
  return (
    <section className="glass-deep w-full max-w-2xl p-3 sm:p-4" aria-label="Test results">
      {details && (
        <div id="run-details" className="mb-3 max-h-[38dvh] overflow-y-auto border-b border-white/20 pb-3 text-15">
          <p className="text-13 text-white/80">Prototype flow, seed {run.params.seed}, {m.durationS} s</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt>Larvae released</dt><dd className="tabular font-semibold">{m.released}</dd>
            <dt>Reached your structure</dt><dd className="tabular font-semibold">{m.reachedStructure} ({pct(m.reachedStructure)})</dd>
            <dt>Touches</dt><dd className="tabular font-semibold">{m.structureContacts}</dd>
            <dt>Time near structure</dt><dd className="tabular font-semibold">{m.meanNearStructureS.toFixed(2)} s</dd>
            <dt>Time in slow water</dt><dd className="tabular font-semibold">{m.meanShelteredS.toFixed(2)} s</dd>
            <dt>Material</dt><dd className="tabular font-semibold">{material.toLocaleString()}</dd>
            <dt>Settlement</dt><dd className="font-semibold text-coral">Scientific engine pending</dd>
          </dl>
          {tests.length > 1 && (
            <>
              <p className="mt-3 font-display font-semibold">Your tests</p>
              <table className="mt-1 w-full text-13">
                <thead><tr className="text-left text-white/80"><th>#</th><th>Reached</th><th>Touches</th><th>Material</th></tr></thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.n}><td>{t.n}</td><td className="tabular">{t.metrics.reachedStructure}</td><td className="tabular">{t.metrics.structureContacts}</td><td className="tabular">{t.material}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="mt-3 text-13 leading-snug text-white/80">
            Simplified flow for play: water slows near surfaces, larvae swim and drift, no wakes or eddies. Not a settlement prediction.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label="Reached" value={m.reachedStructure} note={`${pct(m.reachedStructure)} of ${m.released}`} />
        <Stat label="Touches" value={m.structureContacts} />
        <Stat label="Material" value={material.toLocaleString()} />
        <Stat label="Settlement" value="Pending" note="Scientific engine pending" pending />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/20 pt-3">
        {children}
        <button className="btn ml-auto" aria-expanded={details} aria-controls="run-details" onClick={() => setDetails((d) => !d)}>
          <span>Details</span>
          <span aria-hidden className={`inline-flex transition-transform ${details ? '' : 'rotate-180'}`}>{Icon.chevron}</span>
        </button>
      </div>
    </section>
  );
}
