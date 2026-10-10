import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile, SimFrame } from "../../contracts";
import { applyTool, heightLimits, surfaceHeights, preset, type ProfileLimits } from "../../geometry";
import { buildError, materialUsed } from "../../experiment/missions";
import { subscribeFrames } from "../../sim/client";
import { DEFAULT_GRID, PROFILE_HEADROOM } from "../../sim/params";
import { useApp } from "../../state/store";
import styles from "./SimView.module.css";

const { nx, ny, cellSizeMm } = DEFAULT_GRID;
export const LIMITS: ProfileLimits = { nx, ny, headroom: PROFILE_HEADROOM };
/** Free-stream peak in lattice units; arrow length and opacity are relative to it. */
const PEAK = 0.1;

type Colors = Record<
  "water" | "waterDeep" | "sand3" | "sand5" | "sand7" | "sandEdge" | "larva" | "halo" | "settled" | "flow" | "band" | "sun" | "ink" | "invalid",
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
    invalid: v("--c-coral-700"),
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
  const frameQueue = useRef<SimFrame[]>([]);
  const lastPlayback = useRef(0);
  const revealedAt = useRef(0);
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
  const mode = useApp(s => s.mode);
  const taskLabel = useApp(s => s.taskLabel);
  const baselineRun = useApp(s => s.baselineRun);
  const animationSpeed = useApp(s => s.animationSpeed);
  const reducedMotion = useApp(s => s.reducedMotion);
  const toolWidth = useApp(s => s.toolWidth);
  const toolHeight = useApp(s => s.toolHeight);
  const selectedColumn = useApp(s => s.selectedColumn);
  const [placement, setPlacement] = useState("");

  const live = useRef({ profile, tool, showFlow, stale, mode, taskLabel, toolWidth, toolHeight, selectedColumn, record, baselineRun, animationSpeed, reducedMotion });
  live.current = { profile, tool, showFlow, stale, mode, taskLabel, toolWidth, toolHeight, selectedColumn, record, baselineRun, animationSpeed, reducedMotion };
  useEffect(() => {
    dirty.current = true;
  }, [profile, tool, showFlow, stale, mode, taskLabel, toolWidth, toolHeight, selectedColumn, record]);

  useEffect(() => { frameRef.current = null; frameQueue.current = []; dirty.current = true; revealedAt.current = performance.now(); }, [profile, taskLabel, mode, record]);

  useEffect(
    () =>
      subscribeFrames((f) => {
        frameQueue.current.push(f);
        if (frameQueue.current.length > 180) frameQueue.current.shift();
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
      scale = Math.max(0.1, Math.min(r.width / nx, r.height / ny));
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
      const stride = state === 0 ? Math.max(1, Math.ceil(data.length / 3 / 240)) * 3 : 3;
      for (let i = 0; i < data.length; i += stride) {
        if (data[i + 2] !== state) continue;
        const px = data[i]! * scale;
        const py = H - data[i + 1]! * scale;
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, Math.PI * 2);
      }
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      if (live.current.mode === "simulate" && frameQueue.current.length && now - lastPlayback.current >= 60 / live.current.animationSpeed) {
        frameRef.current = frameQueue.current.shift()!;
        lastPlayback.current = now;
        dirty.current = true;
      }
      const reveal = live.current.reducedMotion ? 1 : Math.min(1,(now-revealedAt.current)/600);
      if (live.current.mode === "results" && reveal < 1) dirty.current = true;
      if (!dirty.current) return;
      dirty.current = false;
      const { profile: editedProfile, tool, showFlow, mode, baselineRun, toolWidth, toolHeight, selectedColumn, record } = live.current;
      const profile = mode === "simulate" && baselineRun ? preset("flat") : editedProfile;
      const stale = false;
      const W = nx * scale;
      const H = ny * scale;
      const Y = (y: number) => H - y * scale;

      // Water, deepening toward the bed
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, colors.water);
      g.addColorStop(1, colors.waterDeep);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Decorative sunlight, kept separate from the physical flow vectors.
      ctx.fillStyle = colors.halo;
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.045;
        ctx.beginPath(); ctx.moveTo(W * (i / 6 - 0.08), 0); ctx.lineTo(W * (i / 6 + 0.015), 0);
        ctx.lineTo(W * (i / 6 + 0.35), H); ctx.lineTo(W * (i / 6 + 0.12), H); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (buildEnabled) {
        ctx.strokeStyle = colors.halo; ctx.globalAlpha = 0.15; ctx.lineWidth = 0.5; ctx.beginPath();
        for (let x = 0; x <= nx; x += 4) { ctx.moveTo(x*scale,0); ctx.lineTo(x*scale,H); }
        for (let y = 0; y <= ny; y += 4) { ctx.moveTo(0,y*scale); ctx.lineTo(W,y*scale); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }

      // Release zone: a quiet tint with a dashed lower edge
      const bandBottom = (PROFILE_HEADROOM - 2) * scale;
      ctx.fillStyle = colors.band;
      ctx.fillRect(0, 0, W, bandBottom);

      const drag = dragRef.current;
      const candidate: Profile = drag ? applyTool(profile, LIMITS, tool, drag.col, { width: toolWidth, height: drag.height ?? toolHeight }) : profile;
      const shown = buildError(candidate) ? profile : candidate;
      const frame = mode === "simulate" ? frameRef.current : null;

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

      // Restrained rock strata: decorative texture below the authoritative edge.
      ctx.save(); ctx.clip();
      ctx.strokeStyle = colors.sand7; ctx.globalAlpha = 0.15;
      for (let y = 3; y < 14; y += 3) { ctx.beginPath(); for (let x = 0; x <= nx; x++) ctx.lineTo(x*scale,Y(y + Math.sin(x/13)*0.35)); ctx.stroke(); }
      ctx.restore();
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

      // Saved records preserve x only. These are binned horizontal map markers,
      // deliberately not reconstructed attachment heights or mature coral growth.
      if (mode === "results" && record) {
        const bins = new Array<number>(nx).fill(0);
        record.results.settledX.forEach(x => bins[Math.min(nx-1, Math.max(0,Math.floor(x)))]!++);
        for (let x = 0; x < nx; x++) {
          const count = bins[x]!;
          if (!count) continue;
          const px = (x+0.5)*scale, py = Y(surf[x]!) - 2;
          const r = Math.min(4, 1 + Math.sqrt(count)*0.5);
          ctx.globalAlpha = 0.15 + (1-reveal)*0.2; ctx.fillStyle = colors.settled; ctx.beginPath(); ctx.arc(px,py,r*(3+(1-reveal)*4),0,Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = colors.settled; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = colors.halo; ctx.beginPath(); ctx.arc(px,py,0.8,0,Math.PI*2); ctx.fill();
        }
      }
      if (buildEnabled && selectedColumn !== null) {
        const selected = profile.segments.find(s => selectedColumn >= s.x && selectedColumn < s.x+s.width);
        if (selected) { ctx.strokeStyle = colors.sun; ctx.lineWidth = 2; ctx.strokeRect(selected.x*scale, Y(profile.baseHeight+Math.max(0,selected.height))-3, selected.width*scale, Math.max(6,Math.abs(selected.height)*scale)+6); }
      }

      // Placement preview
      const hover = hoverRef.current;
      if (hover !== null && buildEnabled) {
        const d = { width: toolWidth, height: drag?.height ?? toolHeight };
        const center = drag?.col ?? hover;
        const invalid = buildError(applyTool(profile, LIMITS, tool, center, d));
        const x0 = Math.max(0, Math.min(nx - d.width, Math.round(center - d.width / 2)));
        const lim = heightLimits(profile, LIMITS);
        const h = tool === "flat" ? 0 : Math.max(lim.min, Math.min(lim.max, d.height));
        const top = Y(profile.baseHeight + Math.max(h, 0));
        const hh = Math.abs(h) * scale || scale * 0.6;
        ctx.fillStyle = invalid ? colors.invalid : colors.sun;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x0 * scale, top, d.width * scale, hh);
        ctx.globalAlpha = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = invalid ? colors.invalid : colors.sun;
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
    if (e.shiftKey) { useApp.getState().set({ selectedColumn: colAt(e) }); return; }
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
    const candidate = applyTool(profile, LIMITS, tool, d?.col ?? col, { width: toolWidth, height: d?.height ?? toolHeight });
    setPlacement(buildError(candidate) ?? `${materialUsed(candidate).toFixed(1)} / 54 mm after placement`);
    dirty.current = true;
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const next = applyTool(profile, LIMITS, tool, d.col, { width: toolWidth, height: d.height ?? toolHeight });
    if (JSON.stringify(next.segments) !== JSON.stringify(profile.segments))
      useApp.getState().setProfile({ ...next, id: "player", name: "Your design" });
    dirty.current = true;
  };
  const onPointerLeave = () => {
    hoverRef.current = null;
    setCursorMm(null);
    setPlacement("");
    dirty.current = true;
  };

  const strip = useMemo(() => (record && mode === "results" ? density(record.results.settledX) : null), [record, mode]);
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
            onPointerCancel={() => { dragRef.current = null; dirty.current = true; }}
            role="img"
            aria-label={`Cross-section of the seabed profile "${profile.name}" with simulated flow and larvae`}
          />
          <span className={styles.scale} aria-hidden="true">
            <i style={{ width: `${(5 / (nx * cellSizeMm)) * cssWidth}px` }} />5 mm
          </span>
          {buildEnabled && cursorMm !== null && <span className={styles.cursor}>x = {cursorMm.toFixed(2)} mm · {placement}</span>}
        </div>
      </div>

      {mode === "results" && <div className={styles.strip} style={{ width: cssWidth || undefined }}>
        <span className={styles.stripLabel}>Where larvae settled · relative horizontal density</span>
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
      </div>}
    </div>
  );
}
