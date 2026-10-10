// The underwater workshop. For now it offers the published reference tiles, so the whole loop
// (build -> test -> results, solo and in rooms) runs end to end on real geometry. The 3D voxel
// builder (React Three Fiber) replaces the picker and keeps the same contract: it hands a Design up.
import { useState } from 'react';
import { MATERIAL_BUDGET, REFERENCE_TILES, materialOf, type Design } from '@shared';

export const button = 'border-(length:--rule) border-ink bg-bond px-3 py-2 text-15 font-semibold shadow-piece disabled:opacity-50';

export function Workshop({ onSubmit, disabled, submitLabel = 'Test it' }: { onSubmit: (d: Design) => void; disabled?: boolean; submitLabel?: string }) {
  const [pick, setPick] = useState(REFERENCE_TILES[1]!.id);
  const tile = REFERENCE_TILES.find((t) => t.id === pick)!;

  return (
    <section className="border-(length:--rule) border-ink bg-bond p-4 shadow-plate">
      <h2 className="font-display text-32 font-extrabold">Workshop</h2>
      <p className="mt-1 text-15">The 3D builder is next. Until then, pick a published reference tile to run the full loop.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {REFERENCE_TILES.map((t) => (
          <label key={t.id} className={`cursor-pointer border-(length:--rule) border-ink p-3 ${t.id === pick ? 'bg-signal' : 'bg-bond'}`}>
            <input type="radio" name="tile" className="sr-only" checked={t.id === pick} onChange={() => setPick(t.id)} />
            <span className="block font-semibold">{t.name}</span>
            <span className="block text-13">{t.source}</span>
            {t.note && <span className="mt-1 block text-13 italic">{t.note}</span>}
          </label>
        ))}
      </div>
      <p className="tabular mt-3 text-15">
        Material: {materialOf(tile.design)} / {MATERIAL_BUDGET} voxels
      </p>
      <button className={`${button} mt-3`} disabled={disabled} onClick={() => onSubmit(tile.design)}>
        {submitLabel}
      </button>
    </section>
  );
}
