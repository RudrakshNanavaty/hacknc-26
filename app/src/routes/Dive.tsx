// Solo dive: the workshop on one reef. Every test is also evaluated and stored by the server, so it
// shows up in Research Mode with its seed and model version.
import { useCallback, useEffect } from 'react';
import { REFERENCE_TILES, reefById, type ReefId } from '@shared';
import { runExperiment } from '../api';
import { Link } from '../router';
import { Icon } from '../workshop/Icons';
import { useBuild } from '../workshop/store';
import { Workshop } from '../workshop/Workshop';

export function Dive({ reef: id }: { reef: ReefId }) {
  const reef = reefById(id);

  // A first visit starts with the published ridges to play with; a returning builder keeps their work.
  useEffect(() => {
    const s = useBuild.getState();
    if (!s.pieces.length && !s.past.length) s.load(REFERENCE_TILES.find((r) => r.id === 'ridges-2.5mm')?.design.pieces ?? []);
  }, []);

  const onTest = useCallback(
    (design: Parameters<typeof runExperiment>[1], run: { params: { seed: number } }) => {
      void runExperiment(reef.id, design, run.params.seed, 'Diver');
    },
    [reef.id],
  );

  if (!reef.ready) {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <p className="glass p-6 text-18">
          {reef.name} is coming next. <Link to="/" className="font-semibold underline">Back to the ocean</Link>
        </p>
      </main>
    );
  }
  return (
    <Workshop
      reef={reef}
      onTest={onTest}
      corner={<Link to="/" className="btn">{Icon.back}<span>Ocean</span></Link>}
    />
  );
}
