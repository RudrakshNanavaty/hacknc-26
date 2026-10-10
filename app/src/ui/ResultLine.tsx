import type { ExperimentResult } from '@shared';

/** A result's numbers: what the prototype measured, never a made-up settlement rate. */
export function ResultLine({ result }: { result: ExperimentResult }) {
  const m = result.prototype;
  return (
    <span className="tabular">
      {m ? <>Reached <b>{m.reachedStructure}</b>/{m.released}, touches <b>{m.structureContacts}</b>, </> : null}
      material <b>{result.material.toLocaleString()}</b>, seed {result.seed}.{' '}
      {result.settlementRate === null ? <span className="font-semibold text-coral-deep">Settlement: engine pending.</span> : `Settlement ${(result.settlementRate * 100).toFixed(1)}%.`}
    </span>
  );
}
