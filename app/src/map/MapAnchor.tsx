// Floating cards pinned to a place on the map: the district popover (your cards), the negotiation case
// file. The card sits beside the area's center, flips to the other side near the screen edge, follows
// the camera, stays clear of the HUD above and the hand below, and scrolls inside when the window is short.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { districtById } from '@shared';

/** Screen position of a lng/lat on the map (page coordinates). */
export function screenPoint(map: MapLibreMap, lngLat: [number, number]) {
  const r = map.getContainer().getBoundingClientRect();
  const p = map.project(lngLat);
  return { x: r.left + p.x, y: r.top + p.y };
}

/** Re-render when the camera moves, so things pinned to the map stay on their areas. */
export function useCameraTick(map: MapLibreMap | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!map) return;
    const on = () => setTick((t) => t + 1);
    map.on('move', on);
    return () => void map.off('move', on);
  }, [map]);
}

const EDGE = 16;
/** The HUD owns the top of the screen: keep below the meters, and below the news where we would overlap it. */
function hudBottom(left: number, right: number) {
  let bottom = 96;
  for (const el of document.querySelectorAll('.hud-block')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > left && r.left < right) bottom = Math.max(bottom, r.bottom + 10);
  }
  return bottom;
}
/** The hand owns the bottom of the screen while it is out: stop above it where we would overlap it. */
function deckTop(left: number, right: number) {
  let top = window.innerHeight;
  for (const el of document.querySelectorAll('.deck-block')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.right > left && r.left < right) top = Math.min(top, r.top - 8);
  }
  return top;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function MapAnchor({ map, district, width = 380, gap = 96, label, onClose, children }: {
  map: MapLibreMap | null;
  district: string;
  width?: number;
  /** Distance from the area's center to the card's near edge (clears the area's chip). */
  gap?: number;
  label: string;
  /** Dismissible cards close on Escape. */
  onClose?: () => void;
  children: ReactNode;
}) {
  useCameraTick(map);
  const body = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [, setViewport] = useState(0);

  useLayoutEffect(() => {
    if (!body.current) return;
    const ro = new ResizeObserver(() => setHeight(body.current?.offsetHeight ?? 0));
    ro.observe(body.current);
    setHeight(body.current.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const on = () => setViewport((n) => n + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  if (!map) return null;
  const p = screenPoint(map, districtById(district).center);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = p.x + gap + width <= vw - EDGE || p.x - gap - width < EDGE;
  const left = clamp(right ? p.x + gap : p.x - gap - width, EDGE, vw - width - EDGE);
  const ceiling = hudBottom(left, left + width);
  const floor = Math.min(vh, deckTop(left, left + width));
  const maxHeight = floor - ceiling - EDGE;
  const h = Math.min(height || maxHeight, maxHeight);
  const top = clamp(p.y - h / 2, ceiling, floor - h - EDGE);
  const tailY = clamp(p.y - top, 28, h - 28);
  const tailVisible = right ? left > p.x : left + width < p.x;

  return (
    <div className="anchor" role="dialog" aria-label={label} style={{ left, top, width }}>
      {tailVisible && <span className={`anchor-tail ${right ? 'on-left' : 'on-right'}`} style={{ top: tailY }} aria-hidden />}
      <div ref={body} className="float-card anchor-body" style={{ maxHeight }}>
        {children}
      </div>
    </div>
  );
}
