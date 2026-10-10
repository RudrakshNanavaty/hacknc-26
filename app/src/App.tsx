import { isReefId } from '@shared';
import { Kit } from './routes/Kit';
import { Landing } from './routes/Landing';
import { Play } from './routes/Play';
import { Research } from './routes/Research';
import { Solo } from './routes/Solo';
import { Link, matchPath, usePath } from './router';

export function App() {
  const path = usePath();
  let params: Record<string, string> | null;

  if (matchPath('/', path)) return <Landing />;
  // Dev only: the Aero kit showcase (routes/Kit.tsx).
  if (import.meta.env.DEV && matchPath('/kit', path)) return <Kit />;
  if (matchPath('/research', path)) return <Research />;
  if ((params = matchPath('/solo/:reef', path)) && isReefId(params.reef)) return <Solo key={params.reef} reef={params.reef} />;
  if ((params = matchPath('/play/:code', path))) return <Play key={params.code} code={(params.code ?? '').toUpperCase()} />;

  return (
    <main className="px-4 py-10">
      <p className="text-18">
        This page does not exist. <Link to="/" className="underline">Go to the start.</Link>
      </p>
    </main>
  );
}
