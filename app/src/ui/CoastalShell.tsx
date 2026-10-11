import type { ReactNode } from 'react';
import { Link } from '../router';
import { Seascape } from './FloatingBubbles';

/** One wordmark and ocean shell for the entire pre-game flow. */
export function CoastalBrand({ large = false }: { large?: boolean }) {
  return <span className={`coastal-brand${large ? ' coastal-brand-large' : ''}`}>
    <span className="coastal-brand-icon" aria-hidden>🌊</span>
    <span className="hero-title">Coastal Clash</span>
  </span>;
}

export function CoastalShell({ children, roomCode }: { children: ReactNode; roomCode?: string }) {
  return <main className="coastal-shell seascape">
    <Seascape />
    <header className="coastal-header coastal-width">
      <Link to="/" className="coastal-home" aria-label="Coastal Clash home"><CoastalBrand /></Link>
      {roomCode ? <span className="coastal-badge">Room <b>{roomCode}</b></span>
        : <span className="coastal-badge">Miami Beach, Florida</span>}
    </header>
    <div className="coastal-content coastal-width">{children}</div>
  </main>;
}
