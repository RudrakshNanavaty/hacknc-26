import { FxLab } from './routes/FxLab';
import { GlbLab } from './routes/GlbLab';
import { Landing } from './routes/Landing';
import { Play } from './routes/Play';
import { Atlas } from './routes/Atlas';
import { Verify } from './routes/Verify';
import { Plan } from './routes/Plan';
import { Link, matchPath, usePath } from './router';
import { ensurePortraits } from './characters/portraits';

// The 3D characters render in the background from the first screen on, so they are ready by the lobby.
void ensurePortraits();

export function App() {
  const path = usePath();
  let params: Record<string, string> | null;

  if (matchPath('/', path)) return <Landing />;
  if (matchPath('/atlas', path) || matchPath('/studio', path)) return <Atlas />;
  if (import.meta.env.DEV && matchPath('/fx-lab', path)) return <FxLab />;
  if (import.meta.env.DEV && matchPath('/glb-lab', path)) return <GlbLab />;
  if ((params = matchPath('/verify/:matchId', path))) return <Verify key={params.matchId} matchId={params.matchId ?? ''} />;
  if ((params = matchPath('/plan/:matchId', path))) return <Plan key={params.matchId} matchId={params.matchId ?? ''} />;
  if ((params = matchPath('/play/:code', path))) return <Play key={params.code} code={(params.code ?? '').toUpperCase()} />;

  return (
    <main className="flex h-full items-center justify-center p-6">
      <p className="glass p-6 text-18">
        This page does not exist. <Link to="/" className="font-bold underline">Back to the beach.</Link>
      </p>
    </main>
  );
}
