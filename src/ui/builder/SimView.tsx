import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile, SimFrame } from "../../contracts";
import { applyTool, heightLimits, surfaceHeights, TOOL_DEFAULTS, type ProfileLimits } from "../../geometry";
import { subscribeFrames } from "../../sim/client";
import { DEFAULT_GRID, PROFILE_HEADROOM } from "../../sim/params";
import { useApp } from "../../state/store";
import styles from "./SimView.module.css";

const { nx, ny, cellSizeMm } = DEFAULT_GRID;
export const LIMITS: ProfileLimits = { nx, ny, headroom: PROFILE_HEADROOM };
/** Free-stream peak in lattice units; arrow length and opacity are relative to it. */
const PEAK = 0.1;

type Colors = Record<
  "water" | "waterDeep" | "sand3" | "sand5" | "sand7" | "sandEdge" | "larva" | "halo" | "settled" | "flow" | "band" | "sun" | "ink",
  string
>;

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    water: v("--c-sim-water"),
    waterDeep: v("--c-sim-water-deep"),
    sand3: v("--c-sand-300"),
    sand5: v("--c-sand-500"),
    sand7: v("--c-sand-700"),
    sandEdge: v("--c-sand-edge"),
    larva: v("--c-larva"),
    halo: v("--c-larva-halo"),
    settled: v("--c-settled"),
    flow: v("--c-flow"),
    band: v("--c-release-band"),
    sun: v("--c-sun-500"),
    ink: v("--c-ink-700"),
  };
}

interface Drag {
  col: number;
  height: number | null; // null until the pointer moves vertically
}

/** Smoothed settlement density along x (for the strip under the canvas). */
function density(settledX: number[]): number[] {
  const bins = new Array<number>(nx).fill(0);
  for (const x of settledX) bins[Math.min(nx - 1, Math.max(0, Math.floor(x)))]!++;
  const sigma = 1.5;
  const k = [-3, -2, -1, 0, 1, 2, 3].map((d) => Math.exp(-(d * d) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0);
  return bins.map((_, i) => k.reduce((acc, w, j) => acc + w * bins[(i + j - 3 + nx) % nx]!, 0) / sum);
}

/**
 * The authoritative 2D view: geometry, flow, larvae and mouse building, with a
 * settlement strip aligned underneath. Frames are drawn from a ref; React never
 * re-renders per frame.
 */
export function SimView({ buildEnabled }: { buildEnabled: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<SimFrame | null>(null);
  const dirty = useRef(true);
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const [cursorMm, setCursorMm] = useState<number | null>(null);

  const profile = useApp((s) => s.history.present);
  const tool = useApp((s) => s.tool);
  const showFlow = useApp((s) => s.showFlow);
  const record = useApp((s) => s.record);
  const stale = useApp((s) => s.stale);

  const live = useRef({ profile, tool, showFlow, stale });
  live.current = { profile, tool, showFlow, stale };
  useEffect(() => {
    dirty.current = true;
  }, [profile, tool, showFlow, stale]);

  useEffect(
    () =>
      subscribeFrames((f) => {
        frameRef.current = f;
        dirty.current = true;
      }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let colors = readColors();
    let raf = 0;
    let scale = 1;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      scale = Math.max(1, Math.min(r.width / nx, r.height / ny));
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(nx * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${Math.floor(ny * scale)}px`;
      canvas.width = Math.round(nx * scale * dpr);
      canvas.height = Math.round(ny * scale * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colors = readColors();
      setCssWidth(w);
      dirty.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const dots = (data: Float32Array, state: number, r: number, H: number) => {
      ctx.beginPath();
      for (let i = 0; i < data.length; i += 3) {
        if (data[i + 2] !== state) continue;
        const px = data[i]! * scale;
        const py = H - data[i + 1]! * scale;
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, Math.PI * 2);
      }
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty.current) return;
      dirty.current = false;
      const { profile, tool, showFlow, stale } = live.current;
      const W = nx * scale;
      const H = ny * scale;
      const Y = (y: number) => H - y * scale;

      // Water, deepening toward the bed
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, colors.water);
      g.addColorStop(1, colors.waterDeep);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Release zone: a quiet tint with a dashed lower edge
      const bandBottom = (PROFILE_HEADROOM - 2) * scale;
      ctx.fillStyle = colors.band;
      ctx.fillRect(0, 0, W, bandBottom);

      const drag = dragRef.current;
      const shown: Profile = drag ? applyTool(profile, LIMITS, tool, drag.col, drag.height === null ? {} : { height: drag.height }) : profile;
      const frame = frameRef.current;

      ctx.globalAlpha = stale ? 0.35 : 1;

      // Flow: length and opacity follow speed; slow water draws nothing
      if (showFlow && frame && frame.fnx > 0) {
        const bs = nx / frame.fnx;
        const buckets: [number, number, number, number][][] = [[], [], [], []];
        for (let j = 0; j < frame.fny; j++)
          for (let i = 0; i < frame.fnx; i++) {
            const u = frame.ux[j * frame.fnx + i]!;
            const v = frame.uy[j * frame.fnx + i]!;
            const s = Math.hypot(u, v) / PEAK;
            if (s < 0.06) continue;
            const b = Math.min(3, Math.floor(Math.min(1, s) * 4));
            buckets[b]!.push([(i + 0.5) * bs, (j + 0.5) * bs, u / (s * PEAK), v / (s * PEAK)]);
          }
        ctx.strokeStyle = colors.flow;
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1, scale * 0.18);
        buckets.forEach((list, b) => {
          if (!list.length) return;
          ctx.globalAlpha = (stale ? 0.35 : 1) * (0.2 + b * 0.13);
          const len = (0.35 + b * 0.22) * bs * scale;
          ctx.beginPath();
          for (const [cx, cy, dx, dy] of list) {
            const x0 = cx * scale - dx * len * 0.5;
            const y0 = Y(cy) + dy * len * 0.5;
            const x1 = cx * scale + dx * len * 0.5;
            const y1 = Y(cy) - dy * len * 0.5;
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            if (b >= 1) {
              const a = Math.atan2(-dy, dx);
              const hl = Math.min(5, len * 0.32);
              ctx.moveTo(x1 - hl * Math.cos(a - 0.45), y1 - hl * Math.sin(a - 0.45));
              ctx.lineTo(x1, y1);
              ctx.lineTo(x1 - hl * Math.cos(a + 0.45), y1 - hl * Math.sin(a + 0.45));
            }
          }
          ctx.stroke();
        });
        ctx.globalAlpha = stale ? 0.35 : 1;
      }

      // Swimming larvae: haloed dots so they read over water and sand alike
      if (frame && frame.larvae.length) {
        const r = Math.max(1.3, scale * 0.32);
        ctx.fillStyle = colors.halo;
        dots(frame.larvae, 0, r + 1, H);
        ctx.fill();
        ctx.fillStyle = colors.larva;
        dots(frame.larvae, 0, r, H);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Seabed (drawn after larvae so settled dots sit on the surface edge)
      const surf = surfaceHeights(shown, nx);
      const sand = ctx.createLinearGradient(0, Y(26), 0, H);
      sand.addColorStop(0, colors.sand3);
      sand.addColorStop(1, colors.sand5);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x < nx; x++) {
        ctx.lineTo(x * scale, Y(surf[x]!));
        ctx.lineTo((x + 1) * scale, Y(surf[x]!));
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = sand;
      ctx.fill();
      ctx.lineJoin = "round";
      ctx.strokeStyle = colors.sand7;
      ctx.lineWidth = 1;
      ctx.stroke();
      // light catching the top edge
      ctx.beginPath();
      for (let x = 0; x < nx; x++) {
        ctx.moveTo(x * scale + 0.5, Y(surf[x]!) + 1.5);
        ctx.lineTo((x + 1) * scale - 0.5, Y(surf[x]!) + 1.5);
      }
      ctx.strokeStyle = colors.sandEdge;
      ctx.stroke();

      // Settled larvae, drawn on top of the bed edge
      if (frame && frame.larvae.length) {
        const r = Math.max(1.3, scale * 0.32) * 1.25;
        ctx.globalAlpha = stale ? 0.35 : 1;
        ctx.fillStyle = colors.halo;
        dots(frame.larvae, 1, r + 1, H);
        ctx.fill();
        ctx.fillStyle = colors.settled;
        dots(frame.larvae, 1, r, H);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Placement preview
      const hover = hoverRef.current;
      if (!drag && hover !== null && buildEnabled) {
        const d = TOOL_DEFAULTS[tool];
        const x0 = Math.max(0, Math.min(nx - d.width, Math.round(hover - d.width / 2)));
        const lim = heightLimits(profile, LIMITS);
        const h = tool === "flat" ? 0 : Math.max(lim.min, Math.min(lim.max, d.height));
        const top = Y(profile.baseHeight + Math.max(h, 0));
        const hh = Math.abs(h) * scale || scale * 0.6;
        ctx.fillStyle = colors.sun;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x0 * scale, top, d.width * scale, hh);
        ctx.globalAlpha = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = colors.sun;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 * scale + 0.75, top + 0.75, d.width * scale - 1.5, hh - 1.5);
        ctx.setLineDash([]);
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [buildEnabled]);

  const colAt = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(nx - 1, Math.floor(((e.clientX - r.left) / r.width) * nx)));
  };
  const rowAt = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return ny - ((e.clientY - r.top) / r.height) * ny;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!buildEnabled || e.pointerType === "touch" || e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { col: colAt(e), height: null };
    dirty.current = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!buildEnabled || e.pointerType === "touch") return;
    const col = colAt(e);
    hoverRef.current = col;
    setCursorMm(col * cellSizeMm);
    const d = dragRef.current;
    if (d) {
      const rel = Math.round(rowAt(e) - profile.baseHeight);
      if (tool === "recess") d.height = Math.min(-1, rel);
      else if (tool !== "flat") d.height = Math.max(1, rel);
    }
    dirty.current = true;
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const next = applyTool(profile, LIMITS, tool, d.col, d.height === null ? {} : { height: d.height });
    if (JSON.stringify(next.segments) !== JSON.stringify(profile.segments))
      useApp.getState().setProfile({ ...next, id: "player", name: "Your design" });
    dirty.current = true;
  };
  const onPointerLeave = () => {
    hoverRef.current = null;
    setCursorMm(null);
    dirty.current = true;
  };

  const strip = useMemo(() => (record ? density(record.results.settledX) : null), [record]);
  const stripPath = useMemo(() => {
    if (!strip) return null;
    const max = Math.max(1e-9, ...strip);
    const pts = strip.map((v, i) => `${(((i + 0.5) / nx) * 100).toFixed(3)},${(100 - (v / max) * 92).toFixed(2)}`);
    return { area: `M0,100 L${pts.join(" L")} L100,100 Z`, line: `M${pts.join(" L")}` };
  }, [strip]);

  return (
    <div className={styles.view}>
      <div ref={wrapRef} className={styles.canvasWrap}>
        <div className={styles.frame}>
          <canvas
            ref={canvasRef}
            className={`${styles.canvas} ${buildEnabled ? styles.buildable : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            role="img"
            aria-label={`Cross-section of the seabed profile "${profile.name}" with simulated flow and larvae`}
          />
          <span className={styles.scale} aria-hidden="true">
            <i style={{ width: `${(5 / (nx * cellSizeMm)) * cssWidth}px` }} />5 mm
          </span>
          {buildEnabled && cursorMm !== null && <span className={styles.cursor}>x = {cursorMm.toFixed(1)} mm</span>}
        </div>
      </div>

      <div className={styles.strip} style={{ width: cssWidth || undefined }}>
        <span className={styles.stripLabel}>{record ? "Where larvae settled" : "Settlement map appears after a run"}</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`${styles.chart} ${stale ? styles.staleChart : ""}`} aria-hidden="true">
          {stripPath && (
            <>
              <path d={stripPath.area} className={styles.area} />
              <path d={stripPath.line} className={styles.line} vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        <div className={styles.axis} aria-hidden="true">
          {[0, 5, 10, 15, 20, 25, 30].map((mm) => (
            <span key={mm} style={{ left: `${(mm / (nx * cellSizeMm)) * 100}%` }}>
              {mm}
            </span>
          ))}
          <span className={styles.unit}>mm</span>
        </div>
      </div>
    </div>
  );
}
