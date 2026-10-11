// The civic record on Solana (ported from Mayday Mayor's P16): every finished match gets a
// fingerprint of its decisions, matches are anchored in batches as the root of a Merkle tree, and
// each match keeps the proof that it is in the tree. Pure functions on Web Crypto, so the server
// builds the trees and any browser can recompute a fingerprint from the public match record.
// No player names ever go into a fingerprint or a memo: seats and personas only.
import { PROJECTS } from './content';
import { districtById } from './districts';
import type { MatchRecord } from './record';

/** What a match's fingerprint covers: the real stories, every decision and every outcome. */
export interface MatchFingerprintInput {
  matchId: string;
  roomCode: string;
  city: string;
  sessionKind: string;
  rulesVersion: string;
  dataVersion: string;
  startedAt: string;
  endedAt: string | null;
  rounds: {
    round: number;
    /** The real civic story the round re-enacted, when there was one. */
    story: string | null;
    plays: { persona: string; card: string; district: string }[];
    moves: { persona: string; move: string; proposal: string }[];
    deals: string[];
    outcomes: { proposal: string; kind: string; district: string; status: string }[];
  }[];
  scores: { persona: string; total: number }[];
  viable: boolean | null;
}

/** The fingerprint input of a match, from its record (the same on the server and in a browser). */
export function matchFingerprintInput(m: MatchRecord): MatchFingerprintInput {
  const persona = (seat: number) => m.players.find((p) => p.seat === seat)?.persona ?? `seat-${seat}`;
  return {
    matchId: m.id,
    roomCode: m.roomCode,
    city: 'miami-beach',
    sessionKind: m.sessionKind,
    rulesVersion: m.rulesVersion,
    dataVersion: m.dataVersion,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    rounds: m.rounds.map((r) => ({
      round: r.round,
      story: r.crisis.story?.id ?? null,
      plays: [
        ...r.proposals.filter((p) => !p.carried).map((p) => ({ persona: p.persona, card: `project:${p.kind}`, district: p.district })),
        ...r.attachments.map((a) => ({ persona: a.persona, card: a.card, district: a.district })),
      ],
      moves: r.actions.map((a) => ({ persona: a.persona ?? persona(a.seat), move: a.move, proposal: a.proposalId })),
      deals: r.compromises.filter((c) => c.accepted).map((c) => c.id),
      outcomes: r.outcomes.map((o) => ({ proposal: o.proposalId, kind: o.kind, district: o.district, status: o.status })),
    })),
    scores: (m.final?.scores ?? []).map((s) => ({ persona: s.persona, total: s.total })),
    viable: m.final ? m.final.viable : null,
  };
}

/** One step of a Merkle proof: the sibling hash. Pairs are hashed in sorted order, so no side is needed. */
export type MerkleProof = string[];

/** JSON with object keys sorted at every level, so the same value always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
}

/** The match's fingerprint: SHA-256 of its canonical fingerprint input. */
export const matchFingerprint = (input: MatchFingerprintInput) => sha256Hex(canonicalJson(input));

/** The parent of two nodes: the hash of both, smaller first (so a proof needs no left/right flags). */
async function parent(a: string, b: string): Promise<string> {
  const [x, y] = a < b ? [a, b] : [b, a];
  const both = new Uint8Array(64);
  both.set(unhex(x), 0);
  both.set(unhex(y), 32);
  return sha256Hex(both);
}

/** Every level of the tree, leaves first. An odd node out moves up unchanged. */
async function levels(leaves: string[]): Promise<string[][]> {
  if (leaves.length === 0) throw new Error('a Merkle tree needs at least one leaf');
  const out = [leaves];
  while (out.at(-1)!.length > 1) {
    const level = out.at(-1)!;
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? await parent(level[i]!, level[i + 1]!) : level[i]!);
    out.push(next);
  }
  return out;
}

/** The root over `leaves` (hex SHA-256 fingerprints) and each leaf's proof, in the same order. */
export async function merkleTree(leaves: string[]): Promise<{ root: string; proofs: MerkleProof[] }> {
  const tree = await levels(leaves);
  const proofs = leaves.map((_, leaf) => {
    const proof: string[] = [];
    let i = leaf;
    for (const level of tree.slice(0, -1)) {
      const sibling = i % 2 === 0 ? i + 1 : i - 1;
      if (sibling < level.length) proof.push(level[sibling]!);
      i = Math.floor(i / 2);
    }
    return proof;
  });
  return { root: tree.at(-1)![0]!, proofs };
}

/** Whether `leaf` with `proof` leads to `root`. */
export async function verifyProof(leaf: string, proof: MerkleProof, root: string): Promise<boolean> {
  let node = leaf;
  for (const sibling of proof) node = await parent(node, sibling);
  return node === root;
}

/** The memo for a batch of matches: one Memo transaction per batch. */
export const matchesMemo = (root: string, count: number, dataVersion: string) => `coastal-clash:v1:matches:miami-beach:${root}:${count}:${dataVersion}`;

/** The Memo program's limit is 566 bytes; stay under it with room to spare. */
export const MEMO_MAX_BYTES = 560;
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** `head | item; item; ...` within `maxBytes` (UTF-8); items that do not fit are counted ("+2 more"). */
export function fitMemo(head: string, items: string[], maxBytes = MEMO_MAX_BYTES, empty = 'no decisions'): string {
  if (items.length === 0) return `${head} | ${empty}`;
  let memo = `${head} |`;
  for (const [i, d] of items.entries()) {
    const rest = items.length - i - 1;
    const next = `${memo}${i ? ';' : ''} ${d}`;
    if (bytes(next + (rest ? `; +${rest} more` : '')) > maxBytes) return `${memo}${i ? ';' : ''} +${items.length - i} more`;
    memo = next;
  }
  return memo;
}

const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/** A match's outcomes in plain words, round by round: what a planner reads in Solana Explorer. */
export function matchDecisionWords(m: MatchRecord): string[] {
  return m.rounds.flatMap((r) => {
    const where = clip(r.crisis.story?.title ?? r.crisis.title, 34);
    const outcomes = r.outcomes.map((o) => `${PROJECTS[o.kind].name} @ ${districtById(o.district).name.split(',')[0]}: ${o.status}`);
    const deals = r.compromises.filter((c) => c.accepted).map((c) => `deal: ${clip(c.title, 30)}`);
    return [`R${r.round} ${where}`, ...outcomes, ...deals];
  });
}

/**
 * A match's own memo: its outcomes in words plus the fingerprint that ties them to the record.
 *   coastal-clash:v1:match:miami-beach:ABCD:demo:<fingerprint> | R1 West Avenue road raising; Drainage & pump station @ West Avenue Bayfront: approved; ...
 */
export const matchMemo = (input: MatchFingerprintInput, fingerprint: string, decisions: string[]) =>
  fitMemo(`coastal-clash:v1:match:miami-beach:${input.roomCode}:${input.sessionKind}:${fingerprint}`, decisions);
