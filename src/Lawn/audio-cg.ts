// Crazy Games guest build only. Vite redirects `./audio` here when
// `vite build --mode crazygames` runs. The AlterU host keeps audio.ts.
//
// Music files are CC0 derivatives (see doc/cg-audio.md). Effects stay
// synthesized, on their own compressor, so a loud shot cannot squash the bed.
// Nothing plays until the first pointer gesture arms the context.

import nightUrl from './audio/cg/night.ogg';
import bossUrl from './audio/cg/boss.ogg';
import menuUrl from './audio/cg/menu.ogg';
import clearUrl from './audio/cg/clear.ogg';
import overUrl from './audio/cg/over.ogg';

const STORE_KEY = 'gol_cg_audio_v1';

// Integrated loudness after loudnorm, then the gain that lands the bed near -26 LUFS
// (menu matched to the night bed; boss a little hotter; stings near -20 LUFS).
//   night/boss files: -22.0 LUFS    menu: -23.8    clear: -18.0    over: -17.7
const NIGHT_GAIN = 0.62; // -22 + 20*log10(0.62) ≈ -26.2 LUFS
const BOSS_GAIN = 0.75;  // ≈ -24.5 LUFS
const MENU_GAIN = 0.76;  // -23.8 + 20*log10(0.76) ≈ -26.2 LUFS
const STING_GAIN = 0.78; // ≈ -20 LUFS
const DUCK = 0.28;
// Host SFX ride a 0.5 bus under a 0.9 master (peak ≈ -22 dBFS). This bus is
// unity so the same oscillator gains peak near -14 dBFS, just over the bed.
const SFX_BUS = 1;

type BedId = 'night' | 'boss' | 'menu';
type Wanted = 'off' | BedId;
type StingId = 'clear' | 'over';

const URLS: Record<BedId | StingId, string> = {
  night: nightUrl,
  boss: bossUrl,
  menu: menuUrl,
  clear: clearUrl,
  over: overUrl,
};

function store(): Storage {
  try {
    if (typeof alteruLocalStorage !== 'undefined' && alteruLocalStorage) return alteruLocalStorage;
  } catch { /* storage adapter is optional */ }
  return localStorage;
}

function readPrefs(): { muted: boolean; volume: number } {
  try {
    const raw = store().getItem(STORE_KEY);
    if (!raw) return { muted: false, volume: 1 };
    const p = JSON.parse(raw) as { muted?: unknown; volume?: unknown };
    const volume = typeof p.volume === 'number' && Number.isFinite(p.volume)
      ? Math.min(1, Math.max(0, p.volume))
      : 1;
    return { muted: p.muted === true, volume };
  } catch {
    return { muted: false, volume: 1 };
  }
}

const prefs = readPrefs();
let muted = prefs.muted;
let volume = prefs.volume;
let armed = false;
let leftTitle = false;
let combat = false;
let wanted: Wanted = 'off';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

const buffers = new Map<string, AudioBuffer>();
const rawBytes = new Map<string, Promise<ArrayBuffer | null>>();
let preparing: Promise<void> | null = null;
let pendingSting: StingId | null = null;

let bedSource: AudioBufferSourceNode | null = null;
let bedGain: GainNode | null = null;
let bedPlaying: Wanted = 'off';
let bedOffset = 0;
let bedStarted = 0;

let sting: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let stingKind: StingId | null = null;

function savePrefs() {
  try { store().setItem(STORE_KEY, JSON.stringify({ muted, volume })); }
  catch { /* private mode */ }
}

function bedLevel(id: BedId) {
  const base = id === 'boss' ? BOSS_GAIN : id === 'menu' ? MENU_GAIN : NIGHT_GAIN;
  return stingKind === 'clear' ? base * DUCK : base;
}

function ensure(): AudioContext | null {
  if (!armed) return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  if (!master) {
    master = ctx.createGain();
    master.gain.value = muted || volume <= 0 ? 0 : volume;
    master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.1;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_BUS;
    sfxBus.connect(comp);
    comp.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(master);
  }
  return ctx;
}

function applyMaster() {
  if (!master || !ctx) return;
  const v = muted || volume <= 0 ? 0 : volume;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(v, now + 0.03);
}

function prefetch() {
  for (const [id, url] of Object.entries(URLS)) {
    rawBytes.set(id, fetch(url).then((res) => (res.ok ? res.arrayBuffer() : null)).catch(() => null));
  }
}

function prepare(c: AudioContext): Promise<void> {
  if (!preparing) {
    preparing = Promise.all([...rawBytes.entries()].map(async ([id, pending]) => {
      try {
        const bytes = await pending;
        if (!bytes?.byteLength) return;
        buffers.set(id, await c.decodeAudioData(bytes.slice(0)));
      } catch { /* a missing cue must not break the match */ }
    })).then(() => undefined);
  }
  return preparing;
}

function rampBed() {
  if (!bedGain || !ctx || bedPlaying === 'off') return;
  const now = ctx.currentTime;
  bedGain.gain.cancelScheduledValues(now);
  bedGain.gain.setValueAtTime(bedGain.gain.value, now);
  bedGain.gain.linearRampToValueAtTime(bedLevel(bedPlaying), now + 0.12);
}

function stopBedNodes(fade: number) {
  if (!bedSource || !ctx) {
    bedSource = null;
    bedGain = null;
    bedPlaying = 'off';
    return;
  }
  const src = bedSource;
  const g = bedGain;
  bedSource = null;
  bedGain = null;
  bedPlaying = 'off';
  const now = ctx.currentTime;
  if (g) {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + fade);
  }
  try { src.stop(now + fade + 0.03); } catch { /* already stopped */ }
  window.setTimeout(() => { try { src.disconnect(); g?.disconnect(); } catch { /* */ } }, (fade + 0.08) * 1000);
}

function startBed(id: BedId, offset: number) {
  const c = ensure();
  const buf = buffers.get(id);
  if (!c || !buf || !musicBus || muted || volume <= 0 || document.hidden) return;
  stopBedNodes(0.05);
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  src.loop = true;
  src.connect(g);
  g.connect(musicBus);
  const now = c.currentTime;
  const level = bedLevel(id);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(level, now + 0.08);
  const off = ((offset % buf.duration) + buf.duration) % buf.duration;
  src.start(now, off);
  bedSource = src;
  bedGain = g;
  bedPlaying = id;
  bedOffset = off;
  bedStarted = now;
}

function pauseBed() {
  if (!ctx || !bedSource?.buffer) {
    bedSource = null;
    bedGain = null;
    bedPlaying = 'off';
    return;
  }
  const played = Math.max(0, ctx.currentTime - bedStarted);
  bedOffset = (bedOffset + played) % bedSource.buffer.duration;
  try { bedSource.stop(); } catch { /* already stopped */ }
  try { bedSource.disconnect(); bedGain?.disconnect(); } catch { /* */ }
  bedSource = null;
  bedGain = null;
  bedPlaying = 'off';
}

function syncBed() {
  if (!armed || muted || volume <= 0 || document.hidden || wanted === 'off') return;
  if (bedPlaying === wanted && bedSource) {
    rampBed();
    return;
  }
  if (!buffers.has(wanted)) return;
  startBed(wanted, bedOffset);
}

function stopSting(unduck: boolean) {
  const was = stingKind;
  stingKind = null;
  const s = sting;
  sting = null;
  if (s) {
    try { s.src.onended = null; s.src.stop(); } catch { /* already ended */ }
    try { s.src.disconnect(); s.gain.disconnect(); } catch { /* */ }
  }
  if (unduck && was === 'clear') rampBed();
}

function playSting(id: StingId) {
  if (!armed || muted || volume <= 0 || document.hidden) return;
  const c = ensure();
  const buf = buffers.get(id);
  if (!c || !musicBus || !buf) {
    pendingSting = id;
    if (c) void prepare(c).then(flushSting);
    return;
  }
  stopSting(false);
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  src.connect(g);
  g.connect(musicBus);
  g.gain.value = STING_GAIN;
  src.onended = () => {
    if (sting?.src !== src) return;
    sting = null;
    if (stingKind === id) stingKind = null;
    try { src.disconnect(); g.disconnect(); } catch { /* */ }
    if (id === 'clear') rampBed();
  };
  src.start();
  sting = { src, gain: g };
  stingKind = id;
}

function flushSting() {
  if (!pendingSting) return;
  const id = pendingSting;
  pendingSting = null;
  playSting(id);
  if (id === 'clear') rampBed();
}

export function unlockAudio() {
  const first = !armed;
  armed = true;
  const c = ensure();
  if (!c) return;
  if (first) void prepare(c).then(() => { syncBed(); flushSting(); });
  else syncBed();
}

export function setMuted(m: boolean) {
  muted = m;
  savePrefs();
  applyMaster();
  if (!armed) return;
  if (m) {
    pauseBed();
    stopSting(false);
    return;
  }
  if (!document.hidden && wanted !== 'off') startBed(wanted, bedOffset);
}

export function isMuted() { return muted; }

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  savePrefs();
  applyMaster();
  if (volume <= 0 && bedSource) pauseBed();
  else if (armed && !muted && !document.hidden && wanted !== 'off' && !bedSource) startBed(wanted, bedOffset);
}

export function getVolume() { return volume; }

function beginBed(id: BedId, reset: boolean) {
  if (!armed || muted || volume <= 0 || document.hidden) {
    if (bedSource) pauseBed();
    return;
  }
  if (!reset && bedPlaying === id && bedSource) {
    rampBed();
    return;
  }
  if (reset) bedOffset = 0;
  startBed(id, bedOffset);
}

export function setMusic(mode: 'off' | 'night' | 'boss') {
  if (mode === 'boss' || (mode === 'night' && combat)) {
    leftTitle = true;
    if (stingKind === 'over') stopSting(false);
    const changed = wanted !== mode;
    wanted = mode;
    beginBed(mode, changed);
    return;
  }
  if (mode === 'night') {
    // Click to Defend (and the pre-march) keep the title loop until the night steps off.
    leftTitle = true;
    const changed = wanted !== 'menu';
    wanted = 'menu';
    beginBed('menu', changed);
    return;
  }
  if (!leftTitle) {
    const changed = wanted !== 'menu';
    wanted = 'menu';
    if (!changed && bedPlaying === 'menu' && bedSource) return;
    if (armed && !muted && volume > 0 && !document.hidden) startBed('menu', changed ? 0 : bedOffset);
    return;
  }
  combat = false;
  wanted = 'off';
  stopBedNodes(0.15);
}

/** Night-clear sting. The bed ducks until the sting ends or the next march starts. */
export function playClear() {
  playSting('clear');
  rampBed();
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.18, slideTo?: number) {
  const c = ensure(); if (!c || !sfxBus || muted || volume <= 0) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g); g.connect(sfxBus);
  o.start(); o.stop(c.currentTime + dur + 0.02);
}

function noise(dur: number, gain = 0.12, hp = 600) {
  const c = ensure(); if (!c || !sfxBus || muted || volume <= 0) return;
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
  wave() {
    tone(440, 0.1, 'triangle', 0.14);
    setTimeout(() => tone(660, 0.14, 'triangle', 0.14), 90);
    stopSting(true);
    combat = true;
    if (wanted === 'menu') {
      wanted = 'night';
      beginBed('night', true);
    }
  },
  over() { playSting('over'); },
  coin() { tone(880, 0.05, 'square', 0.08); setTimeout(() => tone(1320, 0.06, 'square', 0.07), 45); },
};

function onVisibility() {
  if (document.hidden) {
    pauseBed();
    stopSting(false);
    return;
  }
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
  syncBed();
}

prefetch();
window.addEventListener('pointerdown', () => { unlockAudio(); });
document.addEventListener('visibilitychange', onVisibility);
