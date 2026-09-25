// All audio is synthesized in the browser with the Web Audio API.
// No sampled recordings are shipped. The night bed and the boss bed are
// original compositions (oscillators, filtered noise, look-ahead scheduling).
// Nothing here is a third-party recording, so no external license applies.
// See doc/audio.md.
//
// The feed PRELOADS the next game (it may be mounted + running the attract demo
// while the user is still on another game). So we stay totally silent until the
// player's first real interaction with THIS game: `armed` gates every sound.

let ctx: AudioContext | null = null;
let muted = false;
let armed = false;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let wanted: 'off' | 'night' | 'boss' = 'off';
let musicMode: 'off' | 'night' | 'boss' = 'off';
let schedulerTimer: number | null = null;
let nextNoteAt = 0;
let stepIndex = 0;
let drones: { stop: () => void }[] = [];

// SFX were authored hot (peaks ~0.2). The bus pulls them under the compressor
// so impacts stay punchy without covering the bed. Music sits lower still.
const SFX_BUS = 0.5;
const MUSIC_BUS = 0.11;

function ensure(): AudioContext | null {
  if (!armed) return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); }
    catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!master) {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_BUS;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_BUS;
    musicBus.connect(master);
  }
  return ctx;
}

function ac(): AudioContext | null {
  if (muted || !armed) return null;
  return ensure();
}

export function unlockAudio() {
  armed = true;
  ensure();
  if (wanted !== 'off') {
    const mode = wanted;
    musicMode = 'off';
    setMusic(mode);
  }
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setValueAtTime(m ? 0 : 0.9, ctx.currentTime);
  if (m) stopMusic();
  else if (armed && wanted !== 'off') {
    musicMode = 'off';
    setMusic(wanted);
  }
}
export function isMuted() { return muted; }

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.18, slideTo?: number) {
  const c = ac(); if (!c || !sfxBus) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g); g.connect(sfxBus);
  o.start(); o.stop(c.currentTime + dur + 0.02);
}

function noise(dur: number, gain = 0.12, hp = 600) {
  const c = ac(); if (!c || !sfxBus) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start();
}

export const sfx = {
  plant() { tone(220, 0.12, 'square', 0.16, 440); tone(330, 0.1, 'sine', 0.1); },
  upgrade() { tone(523, 0.09, 'sine', 0.18); setTimeout(() => tone(784, 0.12, 'sine', 0.18), 70); },
  squirt() { noise(0.09, 0.05, 1200); tone(900, 0.06, 'sine', 0.04, 1400); },
  fire() { noise(0.05, 0.04, 1600); tone(640, 0.05, 'square', 0.05, 420); },
  frost() { tone(1500, 0.13, 'sine', 0.06, 2100); tone(950, 0.18, 'triangle', 0.03); },
  mortar() { tone(130, 0.24, 'sawtooth', 0.16, 52); noise(0.2, 0.12, 180); },
  storm() { noise(0.06, 0.06, 2600); tone(1900, 0.07, 'square', 0.05, 700); },
  plague() { noise(0.16, 0.05, 500); tone(320, 0.16, 'sine', 0.04, 180); },
  boom() { tone(90, 0.3, 'sawtooth', 0.2, 40); noise(0.26, 0.16, 150); },
  splat() { noise(0.14, 0.13, 400); tone(160, 0.12, 'sawtooth', 0.08, 60); },
  reachHouse() { tone(200, 0.18, 'sawtooth', 0.2, 70); noise(0.12, 0.1, 200); },
  wave() { tone(440, 0.1, 'triangle', 0.14); setTimeout(() => tone(660, 0.14, 'triangle', 0.14), 90); },
  over() { [440, 330, 247, 165].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.16), i * 130)); },
  coin() { tone(880, 0.05, 'square', 0.08); setTimeout(() => tone(1320, 0.06, 'square', 0.07), 45); },
};

function stopMusic() {
  if (schedulerTimer != null) { window.clearInterval(schedulerTimer); schedulerTimer = null; }
  for (const d of drones) {
    try { d.stop(); } catch { /* already stopped */ }
  }
  drones = [];
  musicMode = 'off';
}

function drone(c: AudioContext, freq: number, type: OscillatorType, gain: number, lowpass: number) {
  if (!musicBus) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(f); f.connect(g); g.connect(musicBus);
  o.start();
  drones.push(o);
}

function wind(c: AudioContext, gain: number) {
  if (!musicBus) return;
  const n = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    // brown-ish noise so the wind sits under the drone instead of hissing
    prev = prev * 0.96 + (Math.random() * 2 - 1) * 0.04;
    data[i] = prev;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = 380;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp); bp.connect(g); g.connect(musicBus);
  src.start();
  drones.push(src);
}

function bell(c: AudioContext, time: number, freq: number, dur: number, gain: number) {
  if (!musicBus) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, time);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g); g.connect(musicBus);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function tickNoise(c: AudioContext, time: number) {
  if (!musicBus) return;
  const dur = 0.05;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 900;
  const g = c.createGain();
  g.gain.setValueAtTime(0.05, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(f); f.connect(g); g.connect(musicBus);
  src.start(time);
  src.stop(time + dur + 0.01);
}

// Night: 72 BPM, A minor pentatonic, note on every other beat.
const NIGHT_HZ = [220, 0, 261.63, 0, 329.63, 0, 293.66, 0];
const NIGHT_BEAT = 60 / 72;
// Boss: 108 BPM, low D phrygian fragment.
const BOSS_HZ = [73.42, 110, 0, 138.59, 110, 0, 87.31, 146.83];
const BOSS_BEAT = 60 / 108;

function scheduleAhead() {
  const c = ctx;
  if (!c || !musicBus || musicMode === 'off') return;
  const horizon = c.currentTime + 0.28;
  const beat = musicMode === 'boss' ? BOSS_BEAT : NIGHT_BEAT;
  const pattern = musicMode === 'boss' ? BOSS_HZ : NIGHT_HZ;
  while (nextNoteAt < horizon) {
    const freq = pattern[stepIndex % pattern.length];
    if (freq > 0) bell(c, nextNoteAt, freq, musicMode === 'boss' ? 0.42 : 0.9, musicMode === 'boss' ? 0.07 : 0.055);
    if (musicMode === 'boss' && stepIndex % 2 === 0) tickNoise(c, nextNoteAt);
    nextNoteAt += beat;
    stepIndex = (stepIndex + 1) % pattern.length;
  }
}

/** Night bed during a defence, boss bed while a champion is on the path. */
export function setMusic(mode: 'off' | 'night' | 'boss') {
  wanted = mode;
  if (!armed || muted) {
    if (musicMode !== 'off') stopMusic();
    return;
  }
  if (mode === musicMode) return;
  stopMusic();
  if (mode === 'off') return;
  const c = ensure();
  if (!c || !musicBus) return;
  musicMode = mode;
  if (mode === 'boss') {
    drone(c, 55, 'sine', 0.22, 360);
    drone(c, 82.5, 'triangle', 0.07, 480);
    drone(c, 110.2, 'sine', 0.04, 520); // slight detune against the fifth
    wind(c, 0.035);
  } else {
    drone(c, 55, 'sine', 0.16, 520);       // A1
    drone(c, 82.41, 'triangle', 0.05, 640); // E2
    drone(c, 164.81, 'sine', 0.03, 900);    // A3, very quiet
    wind(c, 0.02);
  }
  nextNoteAt = c.currentTime + 0.08;
  stepIndex = 0;
  schedulerTimer = window.setInterval(scheduleAhead, 110);
  scheduleAhead();
}
