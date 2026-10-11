// The civic record's API. Public by design: anyone can check a match's proof against the memo on
// Solana without trusting our database.
import type { FastifyInstance } from 'fastify';
import { CLUSTER, explorerAddress } from './chain';
import { type CivicRecord, withExplorer } from './civic';

/** Shown wherever the authority appears: the demo key is not a real government. */
export const AUTHORITY_LABEL = 'Demo authority (simulated), not the City of Miami Beach';

export function registerCivic(app: FastifyInstance, civic: CivicRecord) {
  app.get('/api/solana/status', async () => ({
    enabled: civic.enabled,
    cluster: CLUSTER,
    authority: civic.address,
    authorityLabel: AUTHORITY_LABEL,
    explorerUrl: civic.address ? explorerAddress(civic.address) : null,
    store: civic.store.kind,
  }));

  app.get<{ Params: { matchId: string } }>('/api/solana/proof/:matchId', async (req, reply) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.matchId)) return reply.code(400).send({ error: 'bad match id' });
    const view = await civic.proof(req.params.matchId);
    if (!view) return reply.code(404).send({ error: 'not on the record yet' });
    return { enabled: civic.enabled, cluster: CLUSTER, authorityLabel: AUTHORITY_LABEL, ...view };
  });

  app.get<{ Querystring: { limit?: string } }>('/api/solana/anchors', async (req) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
    return { enabled: civic.enabled, cluster: CLUSTER, anchors: (await civic.store.anchors(limit)).map(withExplorer) };
  });
}
