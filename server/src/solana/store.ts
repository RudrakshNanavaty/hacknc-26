// Where the civic record lives: anchors (Memo transactions) and each match's fingerprint, memo and
// Merkle proof. A JSON file under server/.cache (so the record survives a restart in development),
// in memory when the file cannot be written. Same interface whatever backs it.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MatchFingerprintInput, MerkleProof } from '@shared';

export interface Anchor {
  id: string;
  kind: 'matches';
  createdAt: string;
  /** Merkle root over the batch's match fingerprints. */
  root: string;
  count: number;
  memo: string;
  status: 'pending' | 'confirmed' | 'failed';
  signature: string | null;
  slot: number | null;
  error?: string;
}

export interface MatchProof {
  matchId: string;
  input: MatchFingerprintInput;
  fingerprint: string;
  anchorId: string | null;
  proof: MerkleProof | null;
  /** The match's own memo: its outcomes in words, on Solana (null with the chain off). */
  memo: { text: string; status: 'confirmed' | 'failed'; signature: string | null; slot: number | null; error?: string } | null;
}

export interface CivicStore {
  readonly kind: 'file' | 'memory' | 'tiger';
  saveMatch(m: MatchProof): Promise<void>;
  match(matchId: string): Promise<MatchProof | null>;
  unanchored(limit: number): Promise<MatchProof[]>;
  /** Matches whose own memo failed to land on Solana. */
  failedMemos(limit: number): Promise<MatchProof[]>;
  saveAnchor(a: Anchor): Promise<void>;
  anchor(id: string): Promise<Anchor | null>;
  anchors(limit: number): Promise<Anchor[]>;
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'civic-record.json');

export class FileCivicStore implements CivicStore {
  kind: 'file' | 'memory' = 'file';
  private matches = new Map<string, MatchProof>();
  private anchorsById = new Map<string, Anchor>();
  private loaded: Promise<void>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file = FILE) {
    this.loaded = readFile(file, 'utf8')
      .then((t) => {
        const d = JSON.parse(t) as { matches: MatchProof[]; anchors: Anchor[] };
        for (const m of d.matches) this.matches.set(m.matchId, m);
        for (const a of d.anchors) this.anchorsById.set(a.id, a);
      })
      .catch(() => {});
  }

  private persist() {
    const body = JSON.stringify({ matches: [...this.matches.values()], anchors: [...this.anchorsById.values()] });
    this.writing = this.writing
      .then(() => mkdir(dirname(this.file), { recursive: true }))
      .then(() => writeFile(this.file, body))
      .catch(() => void (this.kind = 'memory'));
    return this.writing;
  }

  async saveMatch(m: MatchProof) {
    await this.loaded;
    this.matches.set(m.matchId, structuredClone(m));
    await this.persist();
  }
  async match(id: string) {
    await this.loaded;
    return this.matches.get(id) ?? null;
  }
  async unanchored(limit: number) {
    await this.loaded;
    return [...this.matches.values()].filter((m) => !m.anchorId).slice(0, limit);
  }
  async failedMemos(limit: number) {
    await this.loaded;
    return [...this.matches.values()].filter((m) => m.memo?.status === 'failed').slice(0, limit);
  }
  async saveAnchor(a: Anchor) {
    await this.loaded;
    this.anchorsById.set(a.id, structuredClone(a));
    await this.persist();
  }
  async anchor(id: string) {
    await this.loaded;
    return this.anchorsById.get(id) ?? null;
  }
  async anchors(limit: number) {
    await this.loaded;
    return [...this.anchorsById.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}

/** Memory only (tests). */
export class MemoryCivicStore extends FileCivicStore {
  constructor() {
    super('/dev/null/coastal-clash-civic-memory.json');
    this.kind = 'memory';
  }
}
