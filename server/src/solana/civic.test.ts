import { describe, expect, it } from 'vitest';
import { matchFingerprint, matchFingerprintInput, merkleTree, verifyProof, type MatchRecord } from '@shared';
import { civicRecord } from './civic';
import type { Chain } from './chain';
import { MemoryCivicStore } from './store';

const record = (id: string, extra: Partial<MatchRecord> = {}): MatchRecord => ({
  id, roomCode: 'ABCD', city: 'Miami Beach, Florida', scenario: 's', rulesVersion: 'r', dataVersion: 'd', dataSources: [], sessionKind: 'demo',
  startedAt: '2026-10-11T00:00:00.000Z', endedAt: '2026-10-11T00:05:00.000Z',
  players: [{ seat: 0, name: 'Secret Name', persona: 'mayor', participant: 'human' }],
  rounds: [], final: { indicators: { flood: 40, economy: 50, environment: 40, access: 50, budget: 20 }, viable: true, failing: [], scores: [{ persona: 'mayor', total: 12, parts: [] }], winners: ['mayor'] },
  responses: [], ...extra,
} as unknown as MatchRecord);

describe('match fingerprints', () => {
  it('are stable, cover the decisions, and never include player names', async () => {
    const a = matchFingerprintInput(record('11111111-1111-4111-8111-111111111111'));
    expect(JSON.stringify(a)).not.toMatch(/Secret Name/);
    expect(await matchFingerprint(a)).toBe(await matchFingerprint(matchFingerprintInput(record('11111111-1111-4111-8111-111111111111'))));
    const changed = matchFingerprintInput(record('11111111-1111-4111-8111-111111111111', { sessionKind: 'community' }));
    expect(await matchFingerprint(changed)).not.toBe(await matchFingerprint(a));
  });

  it('Merkle proofs verify every leaf and reject a tampered one', async () => {
    const leaves = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((x) => matchFingerprint({ ...matchFingerprintInput(record('11111111-1111-4111-8111-111111111111')), roomCode: x })));
    const { root, proofs } = await merkleTree(leaves);
    for (const [i, l] of leaves.entries()) expect(await verifyProof(l, proofs[i]!, root)).toBe(true);
    expect(await verifyProof(leaves[0]!, proofs[1]!, root)).toBe(false);
  });
});

describe('civic record', () => {
  it('fingerprints a finished match once, writes its memo, and anchors the batch', async () => {
    const memos: string[] = [];
    const chain: Chain = { address: 'Fake111', rpcUrl: 'x', memo: async (t) => (memos.push(t), { signature: `sig${memos.length}`, slot: memos.length }), balanceSol: async () => 1 };
    const civic = civicRecord({ store: new MemoryCivicStore(), chain, log: { info: () => {}, warn: () => {} }, batchMs: 1e9 });
    const r = record('22222222-2222-4222-8222-222222222222');
    const first = await civic.recordMatch(r);
    expect(await civic.recordMatch(r)).toEqual(first);
    await civic.memosSent();
    await civic.flush();
    const view = (await civic.proof(r.id))!;
    expect(view.match.memo?.status).toBe('confirmed');
    expect(memos[0]).toMatch(/^coastal-clash:v1:match:miami-beach:ABCD:demo:/);
    expect(memos[0]).not.toMatch(/Secret Name/);
    expect(view.anchor?.status).toBe('confirmed');
    expect(await verifyProof(view.match.fingerprint, view.match.proof!, view.anchor!.root)).toBe(true);
    expect(await civic.recordMatch({ ...r, id: '33333333-3333-4333-8333-333333333333', final: null })).toBeNull();
    civic.close();
  });
});
