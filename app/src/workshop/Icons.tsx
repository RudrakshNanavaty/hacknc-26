// Small inline icons for the workshop toolbar (stroke = currentColor).
import type { PieceKind } from '@shared';

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const PIECE_ICON: Record<PieceKind, React.ReactNode> = {
  block: svg(<><path d="M5 9l7-4 7 4v7l-7 4-7-4z" /><path d="M5 9l7 4 7-4M12 13v7" /></>),
  ridge: svg(<><path d="M3 18h18" /><path d="M5 18v-6h3v6M10.5 18v-6h3v6M16 18v-6h3v6" /></>),
  arch: svg(<><path d="M4 19V9a8 6 0 0 1 16 0v10" /><path d="M9 19v-6a3 3 0 0 1 6 0v6" /></>),
  tunnel: svg(<><path d="M3 19V10a9 6 0 0 1 18 0v9" /><path d="M8 19v-5a4 3 0 0 1 8 0v5" /><path d="M3 19h18" /></>),
};

export const Icon = {
  select: svg(<path d="M5 3l14 8-6 2-2 6z" />),
  rotate: svg(<><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></>),
  undo: svg(<><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>),
  redo: svg(<><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>),
  trash: svg(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  move: svg(<><path d="M12 3v18M3 12h18" /><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>),
  grid: svg(<><path d="M4 4h16v16H4zM4 12h16M12 4v16" /></>),
  play: svg(<path d="M7 4l13 8-13 8z" fill="currentColor" />),
  pause: svg(<><path d="M8 5v14M16 5v14" strokeWidth="3" /></>),
  back: svg(<path d="M15 5l-7 7 7 7" />),
  save: svg(<><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>),
};
