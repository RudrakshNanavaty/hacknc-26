// The living city on top of the real map: stakeholder avatars that walk to where they played,
// speech bubbles above their heads, ghost markers for proposals on the table, and short effects
// (construction, restoration, protest, investment, flood, storm). Everything here is presentation of
// state the server already decided. Avatars and effects sit at pixel offsets around an area's
// center: they are decorative and do not mark surveyed positions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import {
  CARDS, DIRECTOR_EVENTS, PROJECTS, REACTION_MOOD, districtById, resolveRound, roleInfo,
  type Board, type Bubble, type Card, type Mood, type OutcomeStatus, type RoleId, type RoomState,
} from '@shared';
import { spriteSvg } from './sprites';
import { onPortrait } from '../characters/portraits';

/** Screen offset of each role around an area's center (px), clear of the area's chip. */
const SLOT: Record<RoleId, [number, number]> = {
  mayor: [-128, 18], activist: [-78, 48], resort: [78, 48], resident: [128, 18], fisherman: [0, 134], // the fisherman is not a player and is never drawn
};
const slot = (role: RoleId): [number, number] => SLOT[role];
const WALK_MS = 1500;
/** Bubbles overlap a little: each shows for a while, the next one starts soon after. */
const BUBBLE_GAP_MS = 1100;
const BUBBLE_MS = 5200;
const FX_MS = 2600;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const center = (district: string) => districtById(district).center;

/** Where each role stands in this phase. */
export function avatarSpots(state: RoomState): Partial<Record<RoleId, string>> {
  const out: Partial<Record<RoleId, string>> = {};
  const spot = state.crisis?.spotlight ?? [];
  state.players.forEach((p, i) => {
    if (spot.length) out[p.persona] = spot[i % spot.length];
  });
  const board = state.board ?? (state.phase === 'resolve' || state.phase === 'final' ? state.history.at(-1)?.board ?? null : null);
  if (board && state.phase !== 'crisis' && state.phase !== 'select') {
    for (const p of board.proposals) if (!p.carried) out[p.persona] = p.district;
    for (const a of board.attachments) out[a.persona] = a.district;
  }
  for (const b of state.bubbles?.list ?? []) if (b.district) out[b.speaker] = b.district;
  return out;
}

/** What each proposal on the map looks like right now. */
type GhostStatus = 'proposed' | OutcomeStatus;
type Deal = 'none' | 'offered' | 'agreed';
function ghosts(state: RoomState, preview: ReturnType<typeof resolveRound> | null): { id: string; kind: Board['proposals'][number]['kind']; district: string; status: GhostStatus; deal: Deal }[] {
  if ((state.phase === 'reveal' || state.phase === 'negotiate') && state.board) {
    const board = state.board;
    return board.proposals.map((p) => {
      const offers = board.compromises.filter((c) => c.proposalId === p.id);
      return {
        id: p.id, kind: p.kind, district: p.district,
        status: state.phase === 'negotiate' ? preview?.outcomes.find((o) => o.proposalId === p.id)?.status ?? 'proposed' : 'proposed',
        deal: offers.some((c) => c.accepted) ? 'agreed' : offers.length ? 'offered' : 'none',
      };
    });
  }
  if (state.phase === 'resolve') {
    return (state.history.at(-1)?.resolution.outcomes ?? []).filter((o) => o.status !== 'approved').map((o) => ({ id: o.proposalId, kind: o.kind, district: o.district, status: o.status, deal: 'none' as Deal }));
  }
  return [];
}

const GHOST_TAG: Record<GhostStatus, string> = {
  proposed: 'Proposed', approved: 'Would pass', blocked: 'Blocked', rejected: 'Voted down', delayed: 'Delayed', unfunded: 'Unfunded',
};

export type FxKind = 'construct' | 'restore' | 'protest' | 'invest' | 'flood' | 'blocked' | 'campaign' | 'legal' | 'deal' | 'stamp' | 'combo';
const FX_ICON: Record<FxKind, string> = {
  construct: '<span class="fx-icon">🏗️</span><span class="fx-dust"></span>',
  restore: '<span class="fx-icon">🌱</span><span class="fx-spark"></span>',
  protest: '<span class="fx-sign s1">✊</span><span class="fx-sign s2">📢</span><span class="fx-sign s3">🪧</span>',
  invest: '<span class="fx-coin c1">🪙</span><span class="fx-coin c2">🪙</span><span class="fx-coin c3">🪙</span>',
  flood: '<span class="fx-ripple r1"></span><span class="fx-ripple r2"></span><span class="fx-ripple r3"></span>',
  blocked: '<span class="fx-icon">⛔</span>',
  campaign: '<span class="fx-sign s1">📣</span><span class="fx-sign s2">🎉</span><span class="fx-sign s3">📣</span>',
  legal: '<span class="fx-icon">⚖️</span>',
  deal: '<span class="fx-icon">🤝</span>',
  stamp: '<span class="fx-icon">✅</span>',
  combo: '<span class="fx-icon">✨</span><span class="fx-spark"></span>',
};

const RESTORE = new Set(['shoreline', 'dune']);
/** What a card's landing looks like on the map (Card.anim). */
const ANIM_FX: Record<Card['anim'], FxKind | null> = {
  construct: null, restore: null, protest: 'protest', invest: 'invest', campaign: 'campaign', legal: 'legal', deal: 'deal', stamp: 'stamp',
};

export function LivingLayer({ map, state, onFocusProposal }: {
  map: MapLibreMap | null;
  state: RoomState;
  /** A click on a proposal's marker opens it on the case file. */
  onFocusProposal?: (proposalId: string) => void;
}) {
  const onFocusRef = useRef(onFocusProposal);
  onFocusRef.current = onFocusProposal;
  const avatars = useRef(new Map<RoleId, { marker: Marker; el: HTMLDivElement; at: string | null; stop: () => void }>());
  const ghostMarkers = useRef(new Map<string, Marker>());
  const bubbleList = useRef<Bubble[]>([]);
  bubbleList.current = state.bubbles?.list ?? [];
  const [storm, setStorm] = useState<string | null>(null);

  const roles = useMemo<RoleId[]>(() => state.players.map((p) => p.persona), [state.players.map((p) => p.persona).join(',')]);
  const spots = avatarSpots(state);
  const spotKey = roles.map((r) => `${r}:${spots[r] ?? ''}`).join('|');

  // Avatars: one marker per role, made once per map.
  useEffect(() => {
    if (!map) return;
    const made = avatars.current;
    for (const role of roles) {
      if (made.has(role)) continue;
      const info = roleInfo(role);
      const el = document.createElement('div');
      el.className = 'avatar';
      el.dataset.role = role;
      el.dataset.mood = 'idle';
      el.style.setProperty('--tint', info.color);
      el.style.setProperty('--blink', `${-(roles.indexOf(role) * 1.3 + 0.4)}s`);
      el.innerHTML = `<div class="avatar-bubble" role="status"></div><div class="avatar-figure">${spriteSvg(role)}</div><div class="avatar-shadow"></div><div class="avatar-name">${info.name.replace('Environmental ', '')}</div>`;
      el.title = `${info.name}: ${'title' in info ? info.title : ''}`;
      const marker = new Marker({ element: el, anchor: 'bottom', offset: slot(role) });
      made.set(role, { marker, el, at: null, stop: () => {} });
      // The 3D character replaces the drawn sprite once its portrait is rendered (moods are CSS on the figure).
      const figure = el.querySelector('.avatar-figure');
      if (figure && role !== 'fisherman') {
        onPortrait(role, (p) => {
          figure.innerHTML = `<img class="avatar-3d" src="${p.full}" alt="" draggable="false">`;
        });
      }
    }
    for (const [role, a] of made) a.el.style.display = roles.includes(role) ? '' : 'none';
  }, [map, roles]);

  useEffect(() => () => {
    for (const a of avatars.current.values()) {
      a.stop();
      a.marker.remove();
    }
    avatars.current.clear();
  }, [map]);

  // Walk to where you played.
  useEffect(() => {
    if (!map) return;
    for (const role of roles) {
      const a = avatars.current.get(role);
      const to = spots[role];
      if (!a || !to || a.at === to) continue;
      a.stop();
      if (a.at === null || reduceMotion()) {
        a.marker.setLngLat(center(to)).addTo(map);
        a.at = to;
        continue;
      }
      // Start from where the avatar is now (a walk can be interrupted by the next moment).
      const from = a.marker.getLngLat().toArray() as [number, number];
      const dest = center(to);
      const t0 = performance.now();
      let raf = 0;
      a.el.dataset.walking = 'true';
      a.el.dataset.facing = dest[0] < from[0] ? 'left' : 'right';
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / WALK_MS);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        a.marker.setLngLat([from[0] + (dest[0] - from[0]) * e, from[1] + (dest[1] - from[1]) * e]);
        if (k < 1) raf = requestAnimationFrame(step);
        else a.el.dataset.walking = 'false';
      };
      raf = requestAnimationFrame(step);
      a.stop = () => {
        cancelAnimationFrame(raf);
        a.el.dataset.walking = 'false';
      };
      a.at = to;
    }
    // spotKey captures every input that moves an avatar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, spotKey]);

  // Speech bubbles: one after another, each auto-dismissed; the speaker acts out the reaction.
  const bubbleKey = state.bubbles?.key ?? null;
  useEffect(() => {
    if (!map || !bubbleKey) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const order = bubbleList.current.map((b) => b.speaker);
    const setMood = (role: RoleId, mood: Mood) => {
      const a = avatars.current.get(role);
      if (a) a.el.dataset.mood = mood;
    };
    order.forEach((speaker, i) => {
      timers.push(setTimeout(() => {
        const b = bubbleList.current.find((x) => x.speaker === speaker);
        const a = avatars.current.get(speaker);
        if (!b || !a) return;
        const el = a.el.querySelector<HTMLDivElement>('.avatar-bubble')!;
        el.textContent = b.text;
        el.dataset.source = b.source;
        a.el.dataset.speaking = 'true';
        a.el.style.zIndex = '6';
        setMood(speaker, REACTION_MOOD[b.reaction]);
      }, 350 + i * BUBBLE_GAP_MS));
      timers.push(setTimeout(() => {
        const a = avatars.current.get(speaker);
        if (!a) return;
        a.el.dataset.speaking = 'false';
        a.el.style.zIndex = '';
      }, 350 + i * BUBBLE_GAP_MS + BUBBLE_MS));
      timers.push(setTimeout(() => setMood(speaker, 'idle'), 350 + i * BUBBLE_GAP_MS + BUBBLE_MS + 2500));
    });
    return () => {
      timers.forEach(clearTimeout);
      for (const a of avatars.current.values()) {
        a.el.dataset.speaking = 'false';
        a.el.dataset.mood = 'idle';
        a.el.style.zIndex = '';
      }
    };
  }, [map, bubbleKey]);

  // A Gemini line that arrives late replaces the text of a bubble that is still showing.
  useEffect(() => {
    for (const b of state.bubbles?.list ?? []) {
      const a = avatars.current.get(b.speaker);
      if (!a || a.el.dataset.speaking !== 'true') continue;
      const el = a.el.querySelector<HTMLDivElement>('.avatar-bubble')!;
      if (el.textContent !== b.text) {
        el.textContent = b.text;
        el.dataset.source = b.source;
      }
    }
  }, [state.bubbles]);

  // Proposals on the table, as ghost markers in their area.
  const preview = useMemo(
    () => (state.phase === 'negotiate' && state.board ? resolveRound(state.board, state.actions, state.city) : null),
    [state.phase, state.board, state.actions, state.city],
  );
  const ghostList = ghosts(state, preview);
  const ghostKey = ghostList.map((g) => `${g.id}:${g.status}:${g.deal}`).join('|');
  useEffect(() => {
    if (!map) return;
    const live = new Set(ghostList.map((g) => g.id));
    for (const [id, m] of ghostMarkers.current) if (!live.has(id)) (m.remove(), ghostMarkers.current.delete(id));
    const perDistrict = new Map<string, number>();
    for (const g of ghostList) {
      const k = perDistrict.get(g.district) ?? 0;
      perDistrict.set(g.district, k + 1);
      const n = ghostList.filter((x) => x.district === g.district).length;
      let m = ghostMarkers.current.get(g.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'ghost';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onFocusRef.current?.(g.id);
        });
        m = new Marker({ element: el, anchor: 'bottom' }).setLngLat(center(g.district)).addTo(map);
        ghostMarkers.current.set(g.id, m);
      }
      m.setOffset([k * 46 - (n - 1) * 23, -62]);
      const el = m.getElement();
      el.dataset.status = g.status;
      el.title = `${PROJECTS[g.kind].name} · ${districtById(g.district).name}: ${GHOST_TAG[g.status]}`;
      const deal = g.deal === 'agreed' ? '<span class="ghost-deal" title="A condition was accepted">🤝</span>' : g.deal === 'offered' ? '<span class="ghost-deal is-offered" title="A condition is on the table">🤝?</span>' : '';
      const sig = `${g.kind}|${g.status}|${g.deal}`;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = `<span class="ghost-icon">${PROJECTS[g.kind].marker}${deal}</span><span class="ghost-tag">${GHOST_TAG[g.status]}</span>`;
      }
    }
    // ghostKey captures the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ghostKey]);
  useEffect(() => () => {
    for (const m of ghostMarkers.current.values()) m.remove();
    ghostMarkers.current.clear();
  }, [map]);

  // Effects at each moment.
  const moment = `${state.phase}-${state.round}`;
  useEffect(() => {
    if (!map) return;
    const fx: { district: string; kind: FxKind; delay: number }[] = [];
    // The crisis itself is acted out by CrisisFx.
    // The twist lands when play starts.
    if (state.phase === 'select' && state.event?.round === state.round) fx.push({ district: state.event.district, kind: DIRECTOR_EVENTS[state.event.type].fx, delay: 200 });
    if (state.phase === 'reveal' && state.board) {
      state.board.attachments.forEach((a, i) => {
        const kind = ANIM_FX[CARDS[a.card].anim];
        if (kind) fx.push({ district: a.district, kind, delay: 1300 + i * 280 });
      });
    }
    if (state.phase === 'resolve') {
      const last = state.history.at(-1);
      last?.resolution.outcomes.forEach((o, i) => {
        if (o.status === 'approved') fx.push({ district: o.district, kind: RESTORE.has(o.kind) ? 'restore' : 'construct', delay: 400 + i * 350 });
        if (o.status === 'blocked' || o.status === 'rejected') fx.push({ district: o.district, kind: 'blocked', delay: 400 + i * 350 });
      });
      (last?.resolution.combos ?? []).forEach((c, i) => fx.push({ district: c.district, kind: 'combo', delay: 1500 + i * 400 }));
      if (last?.resolution.events.some((e) => e.rule === 'S9')) setStorm(`storm-${state.round}`);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const made: Marker[] = [];
    for (const f of fx) {
      timers.push(setTimeout(() => {
        const el = document.createElement('div');
        el.className = `fx fx-${f.kind}`;
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = FX_ICON[f.kind];
        const m = new Marker({ element: el, offset: [0, -10] }).setLngLat(center(f.district)).addTo(map);
        made.push(m);
        timers.push(setTimeout(() => m.remove(), FX_MS));
      }, reduceMotion() ? 0 : f.delay));
    }
    return () => {
      timers.forEach(clearTimeout);
      made.forEach((m) => m.remove());
    };
    // One set of effects per moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, moment]);

  useEffect(() => {
    if (!storm) return;
    const t = setTimeout(() => setStorm(null), 4200);
    return () => clearTimeout(t);
  }, [storm]);

  return storm ? <div key={storm} className="storm-overlay" aria-hidden><span className="storm-flash" /></div> : null;
}
