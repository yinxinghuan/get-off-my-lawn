// Procedural WebAudio SFX — no asset files. Lazily unlocked on first tap.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() { ac(); }
export function setMuted(m: boolean) { muted = m; }
export function isMuted() { return muted; }

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.18, slideTo?: number) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g); g.connect(c.destination);
  o.start(); o.stop(c.currentTime + dur + 0.02);
}

function noise(dur: number, gain = 0.12, hp = 600) {
  const c = ac(); if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start();
}

export const sfx = {
  plant() { tone(220, 0.12, 'square', 0.16, 440); tone(330, 0.1, 'sine', 0.1); },
  upgrade() { tone(523, 0.09, 'sine', 0.18); setTimeout(() => tone(784, 0.12, 'sine', 0.18), 70); },
  squirt() { noise(0.09, 0.05, 1200); tone(900, 0.06, 'sine', 0.04, 1400); },
  splat() { noise(0.14, 0.13, 400); tone(160, 0.12, 'sawtooth', 0.08, 60); },
  reachHouse() { tone(200, 0.18, 'sawtooth', 0.2, 70); noise(0.12, 0.1, 200); },
  wave() { tone(440, 0.1, 'triangle', 0.14); setTimeout(() => tone(660, 0.14, 'triangle', 0.14), 90); },
  over() { [440, 330, 247, 165].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.16), i * 130)); },
  coin() { tone(880, 0.05, 'square', 0.08); setTimeout(() => tone(1320, 0.06, 'square', 0.07), 45); },
};
