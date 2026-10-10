// Underwater ambience, synthesised (no audio files): a low filtered rumble with slow swells and
// the odd bubble. Starts only after a user gesture (browser rule); off when the tab is hidden.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;

function noiseBuffer(c: AudioContext) {
  // Brown noise: integrated white noise, rich in low frequencies like water.
  const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function bubble(c: AudioContext, out: AudioNode) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  const f = 300 + Math.random() * 500;
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * (2 + Math.random()), t + 0.08);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.04, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.15);
}

export function startAmbient(volume = 0.5) {
  if (ctx) {
    void ctx.resume();
    master!.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.setTargetAtTime(volume, ctx.currentTime, 0.8);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  lp.Q.value = 0.7;
  const swell = ctx.createGain();
  swell.gain.value = 0.55;
  // Slow swells: an LFO on the gain and on the filter.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.09;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.25;
  lfo.connect(lfoGain).connect(swell.gain);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.05;
  const lfo2Gain = ctx.createGain();
  lfo2Gain.gain.value = 120;
  lfo2.connect(lfo2Gain).connect(lp.frequency);
  src.connect(lp).connect(swell).connect(master);
  src.start();
  lfo.start();
  lfo2.start();

  const schedule = () => {
    bubbleTimer = setTimeout(() => {
      if (ctx && master && ctx.state === 'running') {
        const n = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) setTimeout(() => ctx && master && bubble(ctx, master), k * 70);
      }
      schedule();
    }, 1500 + Math.random() * 4500);
  };
  schedule();
  document.addEventListener('visibilitychange', onVisibility);
}

function onVisibility() {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
}

export function stopAmbient() {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  const c = ctx;
  setTimeout(() => void c.suspend(), 900);
}

export function disposeAmbient() {
  if (bubbleTimer) clearTimeout(bubbleTimer);
  document.removeEventListener('visibilitychange', onVisibility);
  void ctx?.close();
  ctx = null;
  master = null;
}
