import { useEffect, useRef, useState } from "react";
import type { Profile, SimFrame } from "../../contracts";
import { applyTool, heightLimits, surfaceHeights, TOOL_DEFAULTS, type ProfileLimits } from "../../geometry";
import { subscribeFrames } from "../../sim/client";
import { DEFAULT_GRID, PROFILE_HEADROOM } from "../../sim/params";
import { useApp } from "../../state/store";
import styles from "./SimView.module.css";

const { nx, ny, cellSizeMm } = DEFAULT_GRID;
export const LIMITS: ProfileLimits = { nx, ny, headroom: PROFILE_HEADROOM };

type Colors = Record<"water" | "waterDeep" | "sand3" | "sand5" | "sand7" | "larva" | "settled" | "flow" | "band" | "sun" | "ink" | "inkSoft" | "white", string>;

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    water: v("--c-sim-water"),
    waterDeep: v("--c-sim-water-deep"),
    sand3: v("--c-sand-300"),
    sand5: v("--c-sand-500"),
    sand7: v("--c-sand-700"),
    larva: v("--c-larva"),
    settled: v("--c-settled"),
    flow: v("--c-flow"),
    band: v("--c-release-band"),
    sun: v("--c-sun-500"),
    ink: v("--c-ink-700"),
    inkSoft: v("--c-ink-400"),
    white: v("--c-white"),
  };
}

interface Drag {
  col: number;
  height: number | null; // null until the pointer moves vertically
}

/** The authoritative 2D view: geometry, flow arrows, larvae, settlement map, and mouse building. */
export function SimView({ buildEnabled }: { buildEnabled: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<SimFrame | null>(null);
  const dirty = useRef(true);
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [cursorCol, setCursorCol] = useState<number | null>(null);

  const profile = useApp((s) => s.history.present);
  const tool = useApp((s) => s.tool);
  const showFlow = useApp((s) => s.showFlow);
  const record = useApp((s) => s.record);
  const stale = useApp((s) => s.stale);
  const status = useApp((s) => s.status);
  const stage = useApp((s) => s.stage);
  const progress = useApp((s) => s.progress);

  // Keep the latest values readable from the draw loop without re-subscribing.
  const live = useRef({ profile, tool, showFlow, record, stale });
  live.current = { profile, tool, showFlow, record, stale };
  useEffect(() => {
    dirty.current = true;
  }, [profile, tool, showFlow, record, stale]);

  useEffect(
    () =>
      subscribeFrames((f) => {
        frameRef.current = f;
        dirty.current = true;
      }),
    [],
  );

  // Draw loop: repaints only when something changed.
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
      canvas.style.width = `${nx * scale}px`;
      canvas.style.height = `${ny * scale}px`;
      canvas.width = Math.round(nx * scale * dpr);
      canvas.height = Math.round(ny * scale * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colors = readColors();
      dirty.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty.current) return;
      dirty.current = false;
      const { profile, tool, showFlow, record, stale } = live.current;
      const W = nx * scale;
      const H = ny * scale;
      const Y = (y: number) => H - y * scale;

      // water + release band
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, colors.water);
      g.addColorStop(1, colors.waterDeep);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = colors.band;
      ctx.fillRect(0, 0, W, PROFILE_HEADROOM * scale - 2 * scale);

      // preview geometry while dragging / hovering
      let shown: Profile = profile;
      const drag = dragRef.current;
      const hover = hoverRef.current;
      if (drag) shown = applyTool(profile, LIMITS, tool, drag.col, drag.height === null ? {} : { height: drag.height });

      // seabed
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
      ctx.strokeStyle = colors.sand7;
      ctx.lineWidth = Math.max(1, scale * 0.25);
      ctx.stroke();

      // hover ghost of the feature to be stamped
      if (!drag && hover !== null && buildEnabled) {
        const d = TOOL_DEFAULTS[tool];
        const x0 = Math.max(0, Math.min(nx - d.width, Math.round(hover - d.width / 2)));
        const lim = heightLimits(profile, LIMITS);
        const h = tool === "flat" ? 0 : Math.max(lim.min, Math.min(lim.max, d.height));
        ctx.setLineDash([scale * 0.8, scale * 0.8]);
        ctx.strokeStyle = colors.sun;
        ctx.lineWidth = Math.max(1.5, scale * 0.3);
        ctx.strokeRect(x0 * scale, Y(profile.baseHeight + Math.max(h, 0)), d.width * scale, Math.abs(h) * scale || scale * 0.5);
        ctx.setLineDash([]);
      }

      const frame = frameRef.current;
      ctx.globalAlpha = stale ? 0.45 : 1;

      // flow arrows (downsampled 4×4 blocks)
      if (showFlow && frame && frame.fnx > 0) {
        const bs = nx / frame.fnx;
        ctx.strokeStyle = colors.flow;
        ctx.lineWidth = Math.max(1, scale * 0.22);
        ctx.beginPath();
        for (let j = 0; j < frame.fny; j++)
          for (let i = 0; i < frame.fnx; i++) {
            const u = frame.ux[j * frame.fnx + i]!;
            const v = frame.uy[j * frame.fnx + i]!;
            const s = Math.hypot(u, v);
            if (s < 1e-4) continue;
            const cx = (i + 0.5) * bs * scale;
            const cy = Y((j + 0.5) * bs);
            const len = Math.min(1.8, (s / 0.1) * 1.6) * bs * scale * 0.5;
            const ex = cx + (u / s) * len;
            const ey = cy - (v / s) * len;
            ctx.moveTo(cx - (u / s) * len * 0.4, cy + (v / s) * len * 0.4);
            ctx.lineTo(ex, ey);
            const a = Math.atan2(-(v / s), u / s);
            const hl = Math.max(2, len * 0.35);
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - hl * Math.cos(a - 0.5), ey - hl * Math.sin(a - 0.5));
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - hl * Math.cos(a + 0.5), ey - hl * Math.sin(a + 0.5));
          }
        ctx.stroke();
      }

      // larvae
      if (frame && frame.larvae.length) {
        const r = Math.max(1.2, scale * 0.35);
        for (const settledPass of [0, 1]) {
          ctx.fillStyle = settledPass ? colors.settled : colors.larva;
          ctx.beginPath();
          for (let i = 0; i < frame.larvae.length; i += 3) {
            if (frame.larvae[i + 2] !== settledPass) continue;
            const px = frame.larvae[i]! * scale;
            const py = Y(frame.larvae[i + 1]!);
            ctx.moveTo(px + r, py);
            ctx.arc(px, py, settledPass ? r * 1.3 : r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }

      // settlement map: histogram strip inside the floor
      if (record && !drag) {
        const bins = new Array(nx / 2).fill(0) as number[];
        for (const x of record.results.settledX) bins[Math.min(bins.length - 1, Math.floor(x / 2))]!++;
        const max = Math.max(1, ...bins);
        ctx.fillStyle = colors.settled;
        for (let b = 0; b < bins.length; b++) {
          if (!bins[b]) continue;
          const h = (bins[b]! / max) * 5 * scale;
          ctx.fillRect(b * 2 * scale + scale * 0.2, H - h - scale * 0.4, 2 * scale - scale * 0.4, h);
        }
      }
      ctx.globalAlpha = 1;

      // scale bar: 5 mm
      const barCells = 5 / cellSizeMm;
      ctx.fillStyle = colors.ink;
      ctx.fillRect(W - barCells * scale - 10, 10, barCells * scale, Math.max(2, scale * 0.3));
      ctx.font = `600 ${Math.max(10, Math.round(scale * 2.6))}px system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText("5 mm", W - 10, 14 + Math.max(10, scale * 3));
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
    setCursorCol(col);
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
    setCursorCol(null);
    dirty.current = true;
  };

  const pct = Math.round(progress * 100);
  return (
    <div className={styles.view}>
      <div ref={wrapRef} className={styles.canvasWrap}>
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
      </div>
      <div className={styles.legend}>
        <span className={styles.chip}>
          <i className={styles.swatchLarva} /> swimming larva
        </span>
        <span className={styles.chip}>
          <i className={styles.swatchSettled} /> settled
        </span>
        {showFlow && (
          <span className={styles.chip}>
            <i className={styles.swatchFlow} /> water flow (oscillating)
          </span>
        )}
        <span className={styles.chip}>2D cross-section · 34 × 16 mm</span>
        {buildEnabled && cursorCol !== null && <span className={styles.chip}>x = {(cursorCol * cellSizeMm).toFixed(1)} mm</span>}
        {status === "running" && (
          <span className={`${styles.chip} ${styles.status}`}>
            {stage === "flow" ? "Spinning up the flow" : "Releasing larvae"} · {pct}%
          </span>
        )}
      </div>
    </div>
  );
}
