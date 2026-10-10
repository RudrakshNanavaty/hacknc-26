// Icons for the workshop and the pages: one family (Phosphor), one weight, one size.
// Transport glyphs (play, pause) are the only filled ones.
import {
  ArrowClockwise,
  ArrowsOutCardinal,
  ArrowUUpLeft,
  ArrowUUpRight,
  Bridge,
  CaretLeft,
  CaretUp,
  Cube,
  Cursor,
  FloppyDisk,
  GridFour,
  Mountains,
  Pause,
  Pipe,
  Play,
  Trash,
} from '@phosphor-icons/react';
import type { PieceKind } from '@shared';

const SIZE = 22;
const glyph = (Glyph: typeof Cube, weight: 'regular' | 'fill' = 'regular') => <Glyph size={SIZE} weight={weight} aria-hidden />;

/** One glyph per piece. The workshop also names the active piece in text, so shape need not carry it alone. */
export const PIECE_ICON: Record<PieceKind, React.ReactNode> = {
  block: glyph(Cube),
  ridge: glyph(Mountains),
  arch: glyph(Bridge),
  tunnel: glyph(Pipe),
};

export const Icon = {
  select: glyph(Cursor),
  rotate: glyph(ArrowClockwise),
  undo: glyph(ArrowUUpLeft),
  redo: glyph(ArrowUUpRight),
  trash: glyph(Trash),
  move: glyph(ArrowsOutCardinal),
  grid: glyph(GridFour),
  play: glyph(Play, 'fill'),
  pause: glyph(Pause, 'fill'),
  back: glyph(CaretLeft),
  chevron: glyph(CaretUp),
  save: glyph(FloppyDisk),
};
