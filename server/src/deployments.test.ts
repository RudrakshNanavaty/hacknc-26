import { describe, expect, it } from 'vitest';
import { designOf, ridgedTile } from '@shared';
import { buildServer } from './app';

describe('deployments', () => {
  const app = buildServer();
  const device = {
    id: '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
    reef: 'florida-keys',
    playerId: 'tester-42',
    name: 'Device 1',
    easting: 414731.25,
    northing: 2705544.5,
    crs: 'EPSG:6346',
    y: -5.42,
    slopeDeg: 7.5,
    design: ridgedTile(),
  };

  it('stores a valid device with its real coordinates and lists it per reef', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/deployments', payload: device });
    expect(res.statusCode).toBe(201);
    const list = (await app.inject({ url: '/api/deployments?reef=florida-keys' })).json().deployments;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: device.id, easting: 414731.25, northing: 2705544.5, crs: 'EPSG:6346', elevation: -5.42 });
    expect((await app.inject({ url: '/api/deployments?reef=heron-island' })).json().deployments).toHaveLength(0);
  });

  it('updates in place (same id) when the design changes', async () => {
    await app.inject({ method: 'POST', url: '/api/deployments', payload: { ...device, design: designOf([]) } });
    const list = (await app.inject({ url: '/api/deployments?reef=florida-keys' })).json().deployments;
    expect(list).toHaveLength(1);
    expect(list[0].design.solid).toHaveLength(0);
  });

  it('refuses unknown reefs, missing positions and invalid designs', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/deployments', payload: { ...device, reef: 'atlantis', y: undefined, design: { grid: { nx: 1, ny: 1, nz: 1 }, solid: [] } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().problems).toEqual(expect.arrayContaining(['unknown reef', 'position is required', expect.stringMatching(/^design: grid must be/)]));
  });
});
