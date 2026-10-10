// Deployed devices: a design placed at a real spot on a real reef. Kept per reef in the browser
// (so they persist across visits) and sent to the server (so a deployment is part of the record).
// Placement checks are engineering/gameplay rules on the measured terrain, NOT ecological
// suitability predictions.
import { create } from 'zustand';
import { BUILD_GRID, VOXEL_MM, designOf, type Piece, type ReefId } from '@shared';
import { playerId } from '../api';
import type { Terrain } from './terrain';

export interface Device {
  id: string;
  reef: ReefId;
  name: string;
  /** Local metres (see terrain.ts) and the projected source coordinates. */
  x: number;
  y: number;
  z: number;
  easting: number;
  northing: number;
  crs: string;
  /** Rotation about the vertical axis (radians). */
  yaw: number;
  slopeDeg: number;
  pieces: Piece[];
  createdAt: string;
}

/** The device's base: the build tile (48 x 24 mm) seated on the seabed. */
export const DEVICE_SIZE_M = { x: (BUILD_GRID.nx * VOXEL_MM) / 1000, z: (BUILD_GRID.nz * VOXEL_MM) / 1000 };

export interface PlacementCheck {
  ok: boolean;
  slopeDeg: number;
  /** Height difference under the footprint (m). */
  relief: number;
  measured: boolean;
  nearest: number | null;
  reasons: string[];
  /** The terrain grid is coarser than the device: checks are approximate. */
  coarse: boolean;
}

/** Game rules: max slope, max unevenness under the base, spacing between devices, measured ground. */
export const RULES = { maxSlopeDeg: 25, maxReliefM: 0.03, minSpacingM: 0.3 };

export function checkPlacement(t: Terrain, x: number, z: number, devices: Device[]): PlacementCheck {
  const cell = t.sizeX / (t.width - 1);
  const radius = Math.max(DEVICE_SIZE_M.x / 2, cell);
  const coarse = cell > DEVICE_SIZE_M.x;
  const slopeDeg = t.slopeAt(x, z, radius);
  const relief = t.reliefAt(x, z, DEVICE_SIZE_M.x / 2);
  const measured = t.measuredAt(x, z);
  const nearest = devices.length ? Math.min(...devices.map((d) => Math.hypot(d.x - x, d.z - z))) : null;
  const reasons: string[] = [];
  if (!t.inside(x, z, 0.5)) reasons.push('Too close to the edge of the survey');
  if (!measured) reasons.push('This ground was not measured (a gap in the survey)');
  if (slopeDeg > RULES.maxSlopeDeg) reasons.push(`Too steep: ${slopeDeg.toFixed(0)}° (max ${RULES.maxSlopeDeg}°)`);
  if (!coarse && relief > RULES.maxReliefM) reasons.push(`Too uneven under the base: ${(relief * 100).toFixed(1)} cm (max ${RULES.maxReliefM * 100} cm)`);
  if (nearest !== null && nearest < RULES.minSpacingM) reasons.push(`Too close to another device (${(nearest * 100).toFixed(0)} cm)`);
  return { ok: reasons.length === 0, slopeDeg, relief, measured, nearest, reasons, coarse };
}

const key = (reef: ReefId) => `reefforge.devices.${reef}`;
function load(reef: ReefId): Device[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(reef)) ?? '[]') as Device[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function save(reef: ReefId, devices: Device[]) {
  try {
    localStorage.setItem(key(reef), JSON.stringify(devices));
  } catch {
    // Not remembered in this browser; the server copy still exists.
  }
}

/** Fire-and-forget: the server keeps a record of every deployment (fails soft). */
function sync(d: Device) {
  void fetch('/api/deployments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...d, playerId: playerId(), design: designOf(d.pieces) }),
  }).catch(() => {});
}

interface DeviceState {
  reef: ReefId | null;
  devices: Device[];
  selected: string | null;
  open: (reef: ReefId) => void;
  add: (d: Omit<Device, 'id' | 'createdAt' | 'name'>) => Device;
  update: (id: string, patch: Partial<Device>) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
}

export const useDevices = create<DeviceState>((set, get) => ({
  reef: null,
  devices: [],
  selected: null,
  open: (reef) => set({ reef, devices: load(reef), selected: null }),
  add: (d) => {
    const n = get().devices.length + 1;
    const device: Device = { ...d, id: crypto.randomUUID(), name: `Device ${n}`, createdAt: new Date().toISOString() };
    const devices = [...get().devices, device];
    save(d.reef, devices);
    sync(device);
    set({ devices, selected: device.id });
    return device;
  },
  update: (id, patch) => {
    const devices = get().devices.map((d) => (d.id === id ? { ...d, ...patch } : d));
    const reef = get().reef;
    if (reef) save(reef, devices);
    const d = devices.find((x) => x.id === id);
    if (d) sync(d);
    set({ devices });
  },
  remove: (id) => {
    const devices = get().devices.filter((d) => d.id !== id);
    const reef = get().reef;
    if (reef) save(reef, devices);
    set({ devices, selected: get().selected === id ? null : get().selected });
  },
  select: (selected) => set({ selected }),
}));
