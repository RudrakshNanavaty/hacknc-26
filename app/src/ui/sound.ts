// Game sounds, synthesized with Web Audio (DESIGN.md "Sound"): no files to load, nothing to fail.
// On by default on desktop, off on phones; the choice is remembered. Every call is a no-op when
// sound is off or the browser has no Web Audio.
import { create } from 'zustand';

const KEY = 'coastal-clash-sound';

function initialOn(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'on' || saved === 'off') return saved === 'on';
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return !window.matchMedia('(pointer: coarse)').matches;
}

export const useSound = create<{ on: boolean; toggle: () => void }>((set, get) => ({
  on: initialOn(),
  toggle: () => {
    const on = !get().on;
    set({ on });
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Not remembered; still applies now.
    }
    if (on) unlockAudio();
    else {
      stopRain(0);
      stopAmbience(600);
    }
  },
}));

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio(): { c: AudioContext; out: GainNode } | null {
  if (!useSound.getState().on) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { c: ctx, out: master! };
}

/** Call from a click or tap: browsers only start audio after a user gesture. */
export function unlockAudio() {
  audio();
}

/** True once a gesture has started audio, so speech can play without another tap. */
export const audioRunning = () => !!ctx && ctx.state === 'running' && useSound.getState().on;

export interface Clip {
  stop: () => void;
  /** Seconds. */
  duration: number;
  /** Speech loudness, for the news anchor's mouth. */
  analyser: AnalyserNode;
  ended: Promise<void>;
}

/** Decoded speech, ready to start: its length is known before it plays (the news fits its slot). */
export interface LoadedClip {
  /** Seconds. */
  duration: number;
  play: () => Clip;
}

/** Decode encoded speech (mp3) for the game's audio, so the mute toggle applies to it too. */
export async function loadClip(data: ArrayBuffer): Promise<LoadedClip | null> {
  const a = audio();
  if (!a) return null;
  const { c, out } = a;
  const buffer = await c.decodeAudioData(data.slice(0));
  return {
    duration: buffer.duration,
    play: () => {
      const src = c.createBufferSource();
      src.buffer = buffer;
      const analyser = c.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser).connect(out);
      const ended = new Promise<void>((resolve) => (src.onended = () => resolve()));
      src.start();
      return {
        stop: () => {
          try {
            src.stop();
          } catch {
            // already stopped
          }
        },
        duration: buffer.duration,
        analyser,
        ended,
      };
    },
  };
}

/** Play encoded speech (mp3) through the game's audio at once. */
export async function playClip(data: ArrayBuffer): Promise<Clip | null> {
  const clip = await loadClip(data);
  return clip ? clip.play() : null;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** A piece stamping onto the board: a low thump with a short click. */
export function playStamp() {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.13);
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.22);

  const click = c.createBufferSource();
  click.buffer = noiseBuffer(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const cg = c.createGain();
  cg.gain.setValueAtTime(0.18, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  click.connect(hp).connect(cg).connect(out);
  click.start(t, Math.random() * 2, 0.05);
}

/** The weak-spot scan: a soft rising sweep with ticks, like a radar finding something. */
export function playScan() {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.exponentialRampToValueAtTime(1100, t + 1.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 1.9);
  for (let k = 0; k < 6; k++) {
    const tick = c.createOscillator();
    const tg = c.createGain();
    tick.type = 'square';
    tick.frequency.value = 1400;
    const s = t + 0.15 + k * 0.27;
    tg.gain.setValueAtTime(0.0001, s);
    tg.gain.exponentialRampToValueAtTime(0.03, s + 0.005);
    tg.gain.exponentialRampToValueAtTime(0.0001, s + 0.05);
    tick.connect(tg).connect(out);
    tick.start(s);
    tick.stop(s + 0.06);
  }
}

/** The storm begins: a two-note alert chime (gentler than a real alert tone). */
export function playAlert() {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  [
    [659, 0, 0.2],
    [880, 0.22, 0.34],
  ].forEach(([f, start, len]) => {
    const t = c.currentTime + start!;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f!;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len!);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + len! + 0.05);
  });
}

/** Phones only (coarse pointer), like the stamp's 15 ms buzz. */
export function buzz(pattern: number | number[]) {
  if (!window.matchMedia('(pointer: coarse)').matches || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // some browsers refuse vibration outside a gesture
  }
}

/** A civil-defense siren: a slow wail up and down, `cycles` times. */
export function playSiren(cycles = 2) {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const len = 2.2 * cycles;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1600;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.5);
  g.gain.setValueAtTime(0.09, t + len - 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  lp.connect(g).connect(out);
  for (const detune of [0, 7]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(260, t);
    for (let k = 0; k < cycles; k++) {
      osc.frequency.linearRampToValueAtTime(720, t + k * 2.2 + 1.1);
      osc.frequency.linearRampToValueAtTime(300, t + k * 2.2 + 2.2);
    }
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + len + 0.05);
  }
}

/** An earthquake: a sub-bass roar with a shaking wobble and cracking, `seconds` long. */
export function playRumble(seconds = 4, strength = 1) {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 140;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1.1 * strength, t + 0.3);
  g.gain.setValueAtTime(1.1 * strength, t + seconds * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.connect(lp).connect(g).connect(out);
  src.start(t);
  src.stop(t + seconds + 0.1);
  const sub = c.createOscillator();
  sub.frequency.value = 36;
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.5 * strength, t + 0.25);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  sub.connect(sg).connect(out);
  sub.start(t);
  sub.stop(t + seconds + 0.1);
  for (let k = 0; k < 10 * strength; k++) {
    const s = t + 0.2 + Math.random() * seconds * 0.8;
    const crack = c.createBufferSource();
    crack.buffer = noiseBuffer(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400 + Math.random() * 1400;
    bp.Q.value = 2;
    const cg = c.createGain();
    cg.gain.setValueAtTime(0.0001, s);
    cg.gain.exponentialRampToValueAtTime(0.18 * strength, s + 0.01);
    cg.gain.exponentialRampToValueAtTime(0.0001, s + 0.12);
    crack.connect(bp).connect(cg).connect(out);
    crack.start(s, Math.random() * 2, 0.14);
  }
}

/** The grid fails: a falling hum and a click. */
export function playPowerDown() {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 1.3);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  osc.connect(lp).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 1.5);
}

/** Water rushing over a street as a step's flooding prints. */
export function playWaterRush() {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.exponentialRampToValueAtTime(1300, t + 0.7);
  lp.frequency.exponentialRampToValueAtTime(400, t + 2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
  src.connect(lp).connect(g).connect(out);
  src.start(t, Math.random() * 1.5, 2.2);
}

/** Thunder after a lightning flash, `delay` seconds later. */
export function playThunder(delay: number) {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(420, t);
  lp.frequency.exponentialRampToValueAtTime(80, t + 2.6);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  src.connect(lp).connect(g).connect(out);
  src.start(t, 0, 2.9);
}

let rain: { src: AudioBufferSourceNode; g: GainNode } | null = null;

/** Rain on the roof, looped, fading in. */
export function startRain() {
  const a = audio();
  if (!a || rain) return;
  const { c, out } = a;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 1.2);
  src.connect(bp).connect(g).connect(out);
  src.start();
  rain = { src, g };
}

export function stopRain(fadeMs = 1200) {
  if (!rain || !ctx) return;
  const { src, g } = rain;
  rain = null;
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.01, fadeMs / 1000));
  src.stop(t + fadeMs / 1000 + 0.05);
}

/** A card leaving the hand: a quick airy whoosh. */
export function playDeal() {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * 2, 0.3);
}

/** Notes in sequence: [frequency, start s, length s]. */
function notes(seq: [number, number, number][], type: OscillatorType, level: number) {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  for (const [f, start, len] of seq) {
    const t = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.05);
  }
}

/** Approved: a bright, bubbly arpeggio (Aero optimism). */
export const playApproved = () => notes([[523, 0, 0.18], [659, 0.08, 0.18], [784, 0.16, 0.22], [1047, 0.26, 0.4]], 'triangle', 0.12);
/** Blocked or voted down: two falling notes. */
export const playBlocked = () => notes([[392, 0, 0.22], [262, 0.18, 0.4]], 'square', 0.05);
/** The reveal: a glassy chord swell. */
export const playReveal = () => notes([[659, 0, 0.9], [831, 0.03, 0.9], [988, 0.06, 0.9]], 'sine', 0.07);
/** The last seconds of a clock. */
export const playTick = () => notes([[1320, 0, 0.05]], 'square', 0.025);

// ---------- The lagoon: a soothing ocean bed under every page, and a water "bloop" for buttons ----------

let ambience: { nodes: AudioScheduledSourceNode[]; g: GainNode; timer: number | null } | null = null;
let brown: AudioBuffer | null = null;

/** Brown noise (deep, soft, like distant surf): 8 s, looped. */
function brownBuffer(c: AudioContext): AudioBuffer {
  if (brown && brown.sampleRate === c.sampleRate) return brown;
  brown = c.createBuffer(1, c.sampleRate * 8, c.sampleRate);
  const d = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  // Fade the loop's ends into each other so the seam does not click.
  const n = Math.floor(c.sampleRate * 0.25);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    d[i] = d[i]! * k + d[d.length - n + i]! * (1 - k);
  }
  return brown;
}

/** One small bubble rising: a quick upward sine chirp, quiet. */
function bubbleBlip(c: AudioContext, out: AudioNode, level: number) {
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  const f = 380 + Math.random() * 420;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * (1.8 + Math.random()), t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.15);
}

/**
 * Start the ocean bed: slow swells of deep surf, a soft hiss of foam breathing on another tempo, and a bubble now
 * and then. Persistent across pages; follows the sound toggle; fades in and out.
 */
export function startAmbience() {
  const a = audio();
  if (!a || ambience) return;
  const { c, out } = a;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 3);
  g.connect(out);
  const nodes: AudioScheduledSourceNode[] = [];

  // Deep swell: brown noise, low-passed, its level rising and falling like waves (about 9 s a wave).
  const surf = c.createBufferSource();
  surf.buffer = brownBuffer(c);
  surf.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const swell = c.createGain();
  swell.gain.value = 0.16;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.11;
  const depth = c.createGain();
  depth.gain.value = 0.1;
  lfo.connect(depth).connect(swell.gain);
  surf.connect(lp).connect(swell).connect(g);

  // Foam: white noise, band-passed high and quiet, breathing on a slower, offset cycle; its filter drifts too.
  const foam = c.createBufferSource();
  foam.buffer = noiseBuffer(c);
  foam.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 0.5;
  const foamGain = c.createGain();
  foamGain.gain.value = 0.018;
  const lfo2 = c.createOscillator();
  lfo2.frequency.value = 0.07;
  const depth2 = c.createGain();
  depth2.gain.value = 0.014;
  lfo2.connect(depth2).connect(foamGain.gain);
  const drift = c.createOscillator();
  drift.frequency.value = 0.05;
  const driftDepth = c.createGain();
  driftDepth.gain.value = 350;
  drift.connect(driftDepth).connect(bp.frequency);
  foam.connect(bp).connect(foamGain).connect(g);

  for (const n of [surf, lfo, foam, lfo2, drift]) {
    n.start(t);
    nodes.push(n);
  }
  const state: { nodes: AudioScheduledSourceNode[]; g: GainNode; timer: number | null } = { nodes, g, timer: null };
  // A bubble every few seconds, never on a beat.
  const bubbles = () => {
    if (ambience !== state || !ctx) return;
    bubbleBlip(ctx, g, 0.02 + Math.random() * 0.02);
    if (Math.random() < 0.35) setTimeout(() => ambience === state && ctx && bubbleBlip(ctx, g, 0.015), 120 + Math.random() * 160);
    state.timer = window.setTimeout(bubbles, 2500 + Math.random() * 5500);
  };
  state.timer = window.setTimeout(bubbles, 2000);
  ambience = state;
}

export function stopAmbience(fadeMs = 1200) {
  if (!ambience || !ctx) return;
  const { nodes, g, timer } = ambience;
  ambience = null;
  if (timer !== null) clearTimeout(timer);
  const t = ctx.currentTime;
  const end = t + Math.max(0.01, fadeMs / 1000);
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  for (const n of nodes) n.stop(end + 0.05);
}

/** A button press: a soft water "bloop" (a short sine dropping into a rounder note, with a whisper of splash). */
export function playClick() {
  const a = audio();
  if (!a) return;
  const { c, out } = a;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(980, t);
  osc.frequency.exponentialRampToValueAtTime(520, t + 0.07);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.2);
  const splash = c.createBufferSource();
  splash.buffer = noiseBuffer(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.025, t + 0.005);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  splash.connect(hp).connect(sg).connect(out);
  splash.start(t, Math.random() * 2, 0.08);
}

let installed = false;

/**
 * Once per page: the first tap or key starts audio (browsers require a gesture) and the ocean bed; every button,
 * link-button and summary plays the bloop; the bed follows the sound toggle and rests while the tab is hidden.
 */
export function installSoundscape() {
  if (installed) return;
  installed = true;
  const wake = () => {
    if (!useSound.getState().on || document.hidden) return;
    unlockAudio();
    startAmbience();
  };
  window.addEventListener('pointerdown', wake, { capture: true });
  window.addEventListener('keydown', wake, { capture: true });
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, a.gel, [role="button"], summary');
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    playClick();
  }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAmbience(400);
    else if (audioRunning()) startAmbience();
  });
  useSound.subscribe((s) => {
    if (s.on) wake();
    else stopAmbience(600);
  });
}
