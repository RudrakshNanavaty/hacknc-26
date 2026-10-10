import type { ExperimentResult } from '@shared';

/** A result's numbers. The settlement rate shows only when the engine produced one. */
export function ResultLine({ result }: { result: ExperimentResult }) {
  return (
    <span className="tabular">
      {result.settlementRate === null ? 'Settlement: engine pending' : `Settlement: ${(result.settlementRate * 100).toFixed(1)}%`}
      {' · '}Material: {result.material} voxels{' · '}seed {result.seed}
    </span>
  );
}
