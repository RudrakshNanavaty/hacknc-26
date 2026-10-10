// Calls to the server. Everything here fails soft: the caller gets null and the game goes on.
import type { FeatureCollection } from 'geojson';
import type { Design, ExperimentResult, ReefId } from '@shared';

const PLAYER_KEY = 'reefforge.player';

/** This browser's player id (not secret: it groups a player's experiments on the server). */
export function playerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous-diver';
  }
}

export interface Heat {
  dhw: number;
  date: string;
  source: string;
}

export async function reefHeat(reef: ReefId): Promise<Heat | null> {
  try {
    const r = await fetch(`/api/reefs/${reef}/heat`);
    return r.ok ? ((await r.json()) as { heat: Heat | null }).heat : null;
  } catch {
    return null;
  }
}

export async function runExperiment(reef: ReefId, design: Design, seed: number, playerName: string) {
  try {
    const r = await fetch('/api/experiments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reef, design, seed, playerId: playerId(), playerName }),
    });
    if (!r.ok) return null;
    return (await r.json()) as { id: string; result: ExperimentResult; store: string };
  } catch {
    return null;
  }
}

export interface ExperimentRow {
  id: string;
  createdAt: string;
  reef: ReefId;
  roomCode: string | null;
  playerName: string;
  design: Design;
  result: ExperimentResult;
}

export async function recentExperiments(reef: ReefId): Promise<{ store: string; experiments: ExperimentRow[] } | null> {
  try {
    const r = await fetch(`/api/experiments?reef=${reef}&limit=50`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** NOAA Coral Reef Watch heat stress around a reef, as GeoJSON squares (the map's Heat layer). */
export async function reefHeatGrid(reef: ReefId): Promise<(FeatureCollection & { date?: string | null }) | null> {
  try {
    const r = await fetch(`/api/reefs/${reef}/heat-grid`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
