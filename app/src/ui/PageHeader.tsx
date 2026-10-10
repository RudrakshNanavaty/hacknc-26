// The header of the pages that sit on the sky backdrop: the way back and the title, on one
// glass capsule so they read at any scroll position (white text on the pale sky does not).
import type { ReactNode } from 'react';
import { Link } from '../router';
import { Icon } from '../workshop/Icons';

export function PageHeader({ back, title, children }: { back: string; title: string; children?: ReactNode }) {
  return (
    <header className="glass flex flex-wrap items-center gap-3 rounded-full p-2 pr-6">
      <Link to="/" className="btn">{Icon.back}<span>{back}</span></Link>
      <h1 className="font-display text-32 font-bold">{title}</h1>
      {children}
    </header>
  );
}
