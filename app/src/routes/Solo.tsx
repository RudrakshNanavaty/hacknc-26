// Solo: build and test on one reef. Every test is evaluated and stored by the server.
import { useState } from 'react';
import { reefById, type ExperimentResult, type ReefId } from '@shared';
import { runExperiment } from '../api';
import { Link } from '../router';
import { ReefCard } from '../ui/ReefCard';
import { ResultLine } from '../ui/ResultLine';
import { Workshop, button } from '../workshop/Workshop';

export function Solo({ reef: id }: { reef: ReefId }) {
  const reef = reefById(id);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<{ id: string; result: ExperimentResult }[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!reef.ready) {
    return (
      <main className="p-6">
        <p className="text-18">{reef.name} is coming next. <Link to="/" className="underline">Back to the ocean.</Link></p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <Link to="/" className={`${button} self-start`}>Back to the ocean</Link>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ReefCard reef={reef} />
        <div className="flex flex-col gap-4">
          <Workshop
            disabled={busy}
            onSubmit={async (design) => {
              setBusy(true);
              setError(null);
              // A fresh seed per test; the record keeps it, so any run can be repeated exactly.
              const seed = Math.floor(Math.random() * 2 ** 31);
              const done = await runExperiment(reef.id, design, seed, 'Diver');
              setBusy(false);
              if (done) setRuns((r) => [{ id: done.id, result: done.result }, ...r]);
              else setError('The server did not take the experiment. Is it running?');
            }}
          />
          {error && <p className="border-(length:--rule) border-alarm bg-bond p-3 text-15">{error}</p>}
          {runs.length > 0 && (
            <section className="border-(length:--rule) border-ink bg-bond p-4 shadow-plate">
              <h2 className="font-display text-32 font-extrabold">Your tests</h2>
              <ol className="mt-2 space-y-1 text-15">
                {runs.map((r) => (
                  <li key={r.id}>
                    <ResultLine result={r.result} />{' '}
                    <a className="underline" href={`/api/experiments/${r.id}`} target="_blank" rel="noreferrer">record</a>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
