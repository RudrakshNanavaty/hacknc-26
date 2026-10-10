// Real reef terrain at runtime (built by pipeline/terrain.py into public/terrain/<site>/).
// Local frame, in metres: x = easting - centre, z = -(northing - centre) (three.js looks down -z,
// so north is -z), y = elevation relative to the source's vertical datum. Heights come from the
// largest heightmap loaded; every lookup (camera collision, placement checks, the mesh) uses it.

export interface TerrainSource {
  role: string;
  label: string;
  url: string;
  license: string;
  attribution: string;
  provenance: 'measured' | 'published' | 'model' | 'game-defined';
  doi?: string;
  citation?: string;
}

export interface TerrainMeta {
  site: string;
  crs: string;
  bounds: { minx: number; miny: number; maxx: number; maxy: number };
  size_m: { x: number; y: number };
  vertical_datum: string;
  elevation_units: string;
  elevation_min_m: number;
  elevation_max_m: number;
  heightmaps: { file: string; width: number; height: number }[];
  texture: { file: string; width: number; height: number; coverage: number } | null;
  textures?: { file: string; width: number; height: number }[];
  measured_fraction: number;
  derivation: { elevation: string; texture: string | null };
  sources: TerrainSource[];
  /** Optional: how the world is shown (Heron's 30 m terrain is explored at a larger scale). */
  display?: { detail: 'measured-fine' | 'generated-fine'; note: string };
}

export class Terrain {
  readonly width: number; // samples
  readonly depth: number;
  readonly sizeX: number; // metres
  readonly sizeZ: number;
  readonly heights: Float32Array;

  constructor(
    readonly meta: TerrainMeta,
    raw: Uint16Array,
    w: number,
    h: number,
    readonly measured: Uint8Array | null,
    readonly measuredW: number,
    readonly measuredH: number,
  ) {
    this.width = w;
    this.depth = h;
    this.sizeX = meta.size_m.x;
    this.sizeZ = meta.size_m.y;
    const span = meta.elevation_max_m - meta.elevation_min_m;
    this.heights = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) this.heights[i] = meta.elevation_min_m + (raw[i]! / 65535) * span;
  }

  /** Sample coordinates (fractional) of a local point. Row 0 is the north edge (z = -sizeZ/2). */
  private grid(x: number, z: number): [number, number] {
    const gx = ((x + this.sizeX / 2) / this.sizeX) * (this.width - 1);
    const gz = ((z + this.sizeZ / 2) / this.sizeZ) * (this.depth - 1);
    return [Math.min(this.width - 1, Math.max(0, gx)), Math.min(this.depth - 1, Math.max(0, gz))];
  }

  inside(x: number, z: number, margin = 0) {
    return Math.abs(x) <= this.sizeX / 2 - margin && Math.abs(z) <= this.sizeZ / 2 - margin;
  }

  /** Elevation (m) at a local point, bilinear. */
  heightAt(x: number, z: number): number {
    const [gx, gz] = this.grid(x, z);
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const x1 = Math.min(this.width - 1, x0 + 1), z1 = Math.min(this.depth - 1, z0 + 1);
    const fx = gx - x0, fz = gz - z0;
    const h = (i: number, j: number) => this.heights[j * this.width + i]!;
    return (h(x0, z0) * (1 - fx) + h(x1, z0) * fx) * (1 - fz) + (h(x0, z1) * (1 - fx) + h(x1, z1) * fx) * fz;
  }

  /** Steepest slope (degrees) over a footprint of `radius` metres around a point. */
  slopeAt(x: number, z: number, radius: number): number {
    const r = Math.max(radius, this.sizeX / (this.width - 1));
    const dx = (this.heightAt(x + r, z) - this.heightAt(x - r, z)) / (2 * r);
    const dz = (this.heightAt(x, z + r) - this.heightAt(x, z - r)) / (2 * r);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  }

  /** Local relief (m) inside a footprint: how uneven the ground is under a device. */
  reliefAt(x: number, z: number, radius: number): number {
    let lo = Infinity, hi = -Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const h = this.heightAt(x + (i / 2) * radius, z + (j / 2) * radius);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return hi - lo;
  }

  /** Whether the ground here was measured (true) or filled in by the pipeline (false). */
  measuredAt(x: number, z: number): boolean {
    if (!this.measured) return true;
    const mx = Math.round(((x + this.sizeX / 2) / this.sizeX) * (this.measuredW - 1));
    const mz = Math.round(((z + this.sizeZ / 2) / this.sizeZ) * (this.measuredH - 1));
    return (this.measured[mz * this.measuredW + mx] ?? 0) > 127;
  }

  /** Local point -> projected source coordinates (easting, northing) in meta.crs. */
  toProjected(x: number, z: number): [number, number] {
    const { minx, maxx, miny, maxy } = this.meta.bounds;
    return [(minx + maxx) / 2 + x, (miny + maxy) / 2 - z];
  }
}

/** Smooth value noise in [-1, 1] (seeded hash, bilinear-interpolated). */
function valueNoise(x: number, z: number, seed: number) {
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
  };
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/**
 * Adds GENERATED relief finer than the measured grid (for coarse sources like a 30 m depth model):
 * the measured shape is upsampled to `samples` and seeded multi-octave noise is added, stronger on
 * the reef crest. The result replaces the heights everywhere (mesh, collision, placement), and the
 * "What's real here" panel says it is generated. `measured` stays as the source's mask.
 */
export function withGeneratedRelief(t: Terrain, samples: number, amplitude: (elevation: number) => number): Terrain {
  const w = samples, h = Math.round(samples * (t.sizeZ / t.sizeX));
  const span = t.meta.elevation_max_m - t.meta.elevation_min_m;
  const raw = new Uint16Array(w * h);
  const values = new Float32Array(w * h);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = (i / (w - 1) - 0.5) * t.sizeX;
      const z = (j / (h - 1) - 0.5) * t.sizeZ;
      const base = t.heightAt(x, z);
      // Octaves at ~24 m, 9 m and 3.5 m: reef buttresses, bommies, rubble.
      const n = valueNoise(x / 24, z / 24, 1) * 0.55 + valueNoise(x / 9, z / 9, 2) * 0.3 + valueNoise(x / 3.5, z / 3.5, 3) * 0.15;
      const v = base + n * amplitude(base);
      values[j * w + i] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const meta: TerrainMeta = { ...t.meta, elevation_min_m: lo, elevation_max_m: hi };
  const s2 = Math.max(hi - lo, 1e-6);
  for (let k = 0; k < values.length; k++) raw[k] = Math.round(((values[k]! - lo) / s2) * 65535);
  void span;
  return new Terrain(meta, raw, w, h, t.measured, t.measuredW, t.measuredH);
}

/**
 * A good place to arrive: on the slope at a moderate depth, looking up towards the shallows.
 * Returns the camera position and the point to look at.
 */
export function findStart(t: Terrain, depthBand: [number, number], clearance: number): { at: [number, number, number]; look: [number, number, number] } {
  let best: { score: number; x: number; z: number } | null = null;
  const n = 48;
  for (let j = 4; j < n - 4; j++) {
    for (let i = 4; i < n - 4; i++) {
      const x = (i / (n - 1) - 0.5) * t.sizeX;
      const z = (j / (n - 1) - 0.5) * t.sizeZ;
      const e = t.heightAt(x, z);
      if (e > depthBand[1] || e < depthBand[0] || !t.measuredAt(x, z)) continue;
      const slope = t.slopeAt(x, z, t.sizeX / 40);
      const centred = 1 - Math.hypot(x / t.sizeX, z / t.sizeZ);
      const score = slope * 0.6 + centred * 20;
      if (!best || score > best.score) best = { score, x, z };
    }
  }
  const x = best?.x ?? 0, z = best?.z ?? 0;
  // Look uphill: the direction the ground rises fastest.
  const r = t.sizeX / 30;
  const gx = t.heightAt(x + r, z) - t.heightAt(x - r, z);
  const gz = t.heightAt(x, z + r) - t.heightAt(x, z - r);
  const len = Math.hypot(gx, gz) || 1;
  const dx = gx / len, dz = gz / len;
  const back = Math.min(t.sizeX, t.sizeZ) * 0.04;
  const cx = x - dx * back, cz = z - dz * back;
  const ground = t.heightAt(cx, cz);
  return {
    at: [cx, ground + Math.max(clearance * 4, Math.min(6, (depthBand[1] - depthBand[0]) * 0.35)), cz],
    look: [x + dx * back * 2, t.heightAt(x + dx * back * 2, z + dz * back * 2) + clearance * 2, z + dz * back * 2],
  };
}

async function bytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.arrayBuffer();
}

/** Decodes the measured mask PNG (8-bit is enough for a mask). */
async function maskOf(url: string): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, img.width, img.height).data;
    const data = new Uint8Array(img.width * img.height);
    for (let i = 0; i < data.length; i++) data[i] = px[i * 4]!;
    return { data, w: img.width, h: img.height };
  } catch {
    return null;
  }
}

/**
 * Loads a site: the metadata, then the smallest heightmap (fast first frame), then the largest
 * (`onDetail` fires when the high-detail terrain is ready).
 */
export async function loadTerrain(site: string, onDetail?: (t: Terrain) => void, maxSamples = 1025): Promise<Terrain> {
  const base = `/terrain/${site}`;
  const meta = (await (await fetch(`${base}/terrain.json`)).json()) as TerrainMeta;
  const lods = [...meta.heightmaps].sort((a, b) => a.width - b.width);
  const small = lods[0]!;
  const fine = [...lods].reverse().find((l) => l.width <= maxSamples) ?? small;
  const mask = await maskOf(`${base}/measured.png`);
  const make = async (l: typeof small) =>
    new Terrain(meta, new Uint16Array(await bytes(`${base}/${l.file}`)), l.width, l.height, mask?.data ?? null, mask?.w ?? 0, mask?.h ?? 0);
  const first = await make(small);
  if (fine !== small && onDetail) void make(fine).then(onDetail).catch(() => {});
  return first;
}
