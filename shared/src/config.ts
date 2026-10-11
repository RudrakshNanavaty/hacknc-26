// Room timing. Game-defined knobs; the demo pace is for a two-minute pitch.

export interface Pace {
  crisis: number;
  select: number;
  reveal: number;
  negotiate: number;
  resolve: number;
}

/** Seconds per phase. */
export const PACES: Record<'standard' | 'demo', Pace> = {
  standard: { crisis: 10, select: 40, reveal: 7, negotiate: 30, resolve: 14 },
  demo: { crisis: 6, select: 25, reveal: 5, negotiate: 18, resolve: 10 },
};
export type PaceId = keyof typeof PACES;
