import { isReefId } from '@shared';
import { Dive } from './routes/Dive';
import { Landing } from './routes/Landing';
import { Play } from './routes/Play';
import { Research } from './routes/Research';
import { Link, matchPath, usePath } from './router';

export function App() {
  const path = usePath();
  let params: Record<string, string> | null;

  if (matchPath('/', path)) return <Landing />;
  if (matchPath('/research', path)) return <Research />;
  // /solo/:reef is the old name of the dive.
  if ((params = matchPath('/dive/:reef', path) ?? matchPath('/solo/:reef', path)) && isReefId(params.reef)) return <Dive key={params.reef} reef={params.reef} />;
  if ((params = matchPath('/play/:code', path))) return <Play key={params.code} code={(params.code ?? '').toUpperCase()} />;

  return (
    <main className="flex h-full items-center justify-center p-6">
      <p className="glass p-6 text-18">
        This page does not exist. <Link to="/" className="font-bold underline">Back to the ocean.</Link>
      </p>
    </main>
  );
}
