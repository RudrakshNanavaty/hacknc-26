import { FxLab } from './routes/FxLab';
import { Landing } from './routes/Landing';
import { Play } from './routes/Play';
import { Studio } from './routes/Studio';
import { Link, matchPath, usePath } from './router';

export function App() {
  const path = usePath();
  let params: Record<string, string> | null;

  if (matchPath('/', path)) return <Landing />;
  if (matchPath('/studio', path)) return <Studio />;
  if (import.meta.env.DEV && matchPath('/fx-lab', path)) return <FxLab />;
  if ((params = matchPath('/play/:code', path))) return <Play key={params.code} code={(params.code ?? '').toUpperCase()} />;

  return (
    <main className="flex h-full items-center justify-center p-6">
      <p className="glass p-6 text-18">
        This page does not exist. <Link to="/" className="font-bold underline">Back to the beach.</Link>
      </p>
    </main>
  );
}
