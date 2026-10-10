// Every evaluated design becomes an experiment record: the design, the conditions, the seed and
// the engine version, so a researcher can re-run it from the record alone (one-pager section 5).
// Solo tests (POST /api/experiments) and room rounds both come through here.
import { randomUUID } from 'node:crypto';
import { designProblems, evaluateDesign, isReefId, reefById, type Design, type ExperimentResult, type Flow, type ReefId } from '@shared';

export interface ExperimentRecord {
  id: string;
  createdAt: Date;
  reef: ReefId;
  roomCode: string | null;
  playerId: string;
  playerName: string;
  design: Design;
  /** The conditions it was evaluated under (copied, so later config changes do not rewrite history). */
  flow: Flow | null;
  result: ExperimentResult;
}

export class BadExperiment extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('; '));
  }
}

export interface ExperimentInput {
  reef: unknown;
  design: unknown;
  seed: unknown;
  playerId: unknown;
  playerName: unknown;
  roomCode?: string | null;
}

/** Validates and evaluates a design on the server; the client's own numbers are never trusted. */
export function buildExperiment(input: ExperimentInput): ExperimentRecord {
  const problems = designProblems(input.design);
  if (!isReefId(input.reef)) problems.push('unknown reef');
  else if (!reefById(input.reef).ready) problems.push('that reef is coming next');
  const seed = Number(input.seed);
  if (!Number.isInteger(seed) || seed < 0) problems.push('seed must be a non-negative integer');
  const playerId = typeof input.playerId === 'string' ? input.playerId.trim() : '';
  if (!/^[\w-]{4,64}$/.test(playerId)) problems.push('playerId is required');
  if (problems.length) throw new BadExperiment(problems);

  const design = input.design as Design;
  const reef = input.reef as ReefId;
  return {
    id: randomUUID(),
    createdAt: new Date(),
    reef,
    roomCode: input.roomCode ?? null,
    playerId,
    playerName: String(input.playerName ?? '').trim().slice(0, 24) || 'Diver',
    design: { grid: design.grid, solid: [...design.solid].sort((a, b) => a - b) },
    flow: reefById(reef).flow,
    result: evaluateDesign(design, seed),
  };
}
