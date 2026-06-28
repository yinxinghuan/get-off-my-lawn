import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  P, box, cyl, cone, ball,
  fence, lamp, PLANTS,
  CHARACTERS, ARCHETYPES, MONSTERS, MYTHIC, rigOf,
} from './lab';
import { sfx } from './audio';

// ─── Tuning ────────────────────────────────────────────────────────────────
const START_CASH = 180;
const START_LIVES = 5;
// Upgrade cost rises smoothly (polynomial, NOT exponential) so it always escalates
// but income from surviving longer can keep pace — you can KEEP upgrading forever
// instead of hitting an exponential wall around lvl 10. There's always a next level
// to pour souls into, and it stays affordable as the nights (and your kills) climb.
//   lvl1:55  2:145  3:256  5:524  10:1381  15:2585  20:3646 …  gentle, endless.
const UPGRADE_COST = (lvl: number) => Math.round(55 * Math.pow(lvl, 1.4));
const TOWER_MAX_LVL = 99;   // effectively no ceiling — the only limit is how long you last
const TOWER_VFORM_MAX = 4;  // the head's silhouette has 4 distinct forms; deeper levels keep the top form (+ grow)
const ENEMY_SCALE = 0.46;

// ── Regular serpentine grave-path (boustrophedon): straight rows that switch
// back across the full field, joined by U-turns at alternating ends → a clean,
// readable snake that maximises the ground. Towers drop in the regular gaps
// between rows (each covers the two adjacent lanes). Enemies follow it by distance.
const ROW_X = 3.2;                                   // how far each row runs left/right
const ROWS_Z = [-5.0, -2.4, 0.2, 2.8];              // 4 evenly-spaced rows
const PATH: [number, number][] = [
  [-ROW_X - 0.6, ROWS_Z[0]],                         // spawn (off the left edge)
  [ROW_X, ROWS_Z[0]],
  [ROW_X, ROWS_Z[1]],
  [-ROW_X, ROWS_Z[1]],
  [-ROW_X, ROWS_Z[2]],
  [ROW_X, ROWS_Z[2]],
  [ROW_X, ROWS_Z[3]],
  [0.0, ROWS_Z[3]],                                  // into the crypt
];
const HOUSE_Z = PATH[PATH.length - 1][1]; // crypt sits at the path's end
const SPAWN_Z = PATH[0][1];                // gate end (decor scatter reference)
const LANE_HALF = 0.78;                    // perpendicular spread of enemies on the path

interface PathSeg { ax: number; az: number; dx: number; dz: number; len: number; }
const PATH_SEGS: PathSeg[] = PATH.slice(1).map((b, i) => {
  const a = PATH[i]; const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1e-6;
  return { ax: a[0], az: a[1], dx: dx / len, dz: dz / len, len };
});
const PATH_TOTAL = PATH_SEGS.reduce((s, g) => s + g.len, 0);
/** World pose at distance d along the path: position + forward dir + left normal. */
function posAlong(d: number) {
  let rem = Math.max(0, d);
  for (let i = 0; i < PATH_SEGS.length; i++) {
    const s = PATH_SEGS[i];
    if (rem <= s.len || i === PATH_SEGS.length - 1) {
      const t = Math.min(rem, s.len);
      return { x: s.ax + s.dx * t, z: s.az + s.dz * t, dx: s.dx, dz: s.dz, px: -s.dz, pz: s.dx };
    }
    rem -= s.len;
  }
  const s = PATH_SEGS[PATH_SEGS.length - 1];
  return { x: s.ax + s.dx * s.len, z: s.az + s.dz * s.len, dx: s.dx, dz: s.dz, px: -s.dz, pz: s.dx };
}

// Tower plots — a clean grid in the gaps BETWEEN the serpentine rows. Each gap
// tower sits between two lanes, so it hits enemies on both passes. Perfectly
// regular (3 columns × 3 gap-rows) = reads as a planned cemetery, not scatter.
const GAP_Z = [
  (ROWS_Z[0] + ROWS_Z[1]) / 2,
  (ROWS_Z[1] + ROWS_Z[2]) / 2,
  (ROWS_Z[2] + ROWS_Z[3]) / 2,
];
// [x, z, unlockNight] — 9 core sockets open from the start; 6 in-fill sockets
// (the half-columns between them) open up as the nights climb, so late game keeps
// giving you NEW ground to expand onto, not just towers to upgrade.
const PLOT_SPECS: [number, number, number][] = (() => {
  const spots: [number, number, number][] = [];
  for (const gz of GAP_Z) for (const x of [-2.1, 0, 2.1]) spots.push([x, gz, 0]);
  const infill: [number, number, number][] = [
    [-1.05, GAP_Z[1], 3], [1.05, GAP_Z[1], 5],
    [-1.05, GAP_Z[0], 7], [1.05, GAP_Z[2], 9],
    [1.05, GAP_Z[0], 11], [-1.05, GAP_Z[2], 13],
  ];
  spots.push(...infill);
  return spots;
})();

// ─── Intruder roster — the funny lawn invaders ──────────────────────────────
interface IntruderDef {
  id: string;
  make: () => THREE.Group;
  hp: number;
  spd: number;       // units/sec
  bounty: number;
  scale: number;
  legs: boolean;     // biped (swing legs) vs critter (bob)
  boss?: boolean;    // big, high-HP, every few nights
}
// the freshly-dead — ordinary people who just died (paled), come to squat your plot
function deadDef(key: string, hp: number, spd: number, bounty: number, scale = 1): IntruderDef {
  return { id: 'dead_' + key, make: () => paleDead(CHARACTERS[key]()), hp, spd, bounty, scale, legs: true };
}
// recently-dead in their work/street outfits (the archetype pack, paled)
function deadArch(key: string, hp: number, spd: number, bounty: number, scale = 1): IntruderDef {
  return { id: 'darch_' + key, make: () => paleDead(ARCHETYPES[key]()), hp, spd, bounty, scale, legs: true };
}
function monDef(id: string, key: string, hp: number, spd: number, bounty: number, scale = 1, legs = true): IntruderDef {
  return { id, make: () => MONSTERS[key](), hp, spd, bounty, scale, legs };
}

// Large, varied cast pulled from the whole asset library: 6 undead monsters +
// the full CHARACTERS roster + the ARCHETYPES pack, all as "the freshly dead".
// Ordered roughly by difficulty so the wave pool grows through a diverse crowd.
const ROSTER: IntruderDef[] = [
  monDef('ghost', 'ghost', 16, 2.0, 7, 0.95, false),
  deadDef('kid', 24, 1.32, 8, 0.92),
  monDef('skeleton', 'skeleton', 26, 1.55, 9, 0.95),
  deadDef('student', 32, 1.2, 10),
  deadDef('granny', 28, 1.05, 10, 0.95),
  deadArch('delivery', 38, 1.18, 12),
  deadDef('officeWoman', 34, 1.18, 11),
  monDef('zombie', 'zombie', 58, 0.92, 14),
  deadDef('businessman', 42, 1.1, 13),
  deadArch('nurse', 36, 1.2, 12),
  deadDef('chef', 40, 1.12, 12),
  deadArch('punk', 46, 1.22, 14),
  deadDef('teen', 38, 1.24, 12),
  monDef('mummy', 'mummy', 74, 0.82, 16),
  deadArch('cop', 50, 1.12, 15),
  deadDef('worker', 44, 1.1, 13),
  deadArch('cowboy', 46, 1.14, 14),
  deadDef('darkWoman', 40, 1.18, 13),
  deadArch('rapper', 44, 1.16, 14),
  monDef('vampire', 'vampire', 66, 1.32, 18),
  deadArch('biker', 58, 1.06, 17, 1.05),
  deadDef('bigGuy', 64, 0.98, 18, 1.08),
  deadArch('firefighter', 52, 1.1, 16),
  deadArch('goth', 44, 1.2, 14),
  deadDef('blonde', 38, 1.2, 12),
  deadArch('construction', 60, 1.0, 17, 1.05),
  deadDef('fitWoman', 42, 1.28, 13),
  deadDef('oldman', 30, 1.0, 11, 0.96),
  deadDef('shopkeeper', 40, 1.14, 13),
  monDef('werewolf', 'werewolf', 200, 0.98, 50, 1.22),
];
function poolForWave(w: number): IntruderDef[] {
  // unlock a generous, growing slice so each wave fields a varied crowd
  const n = Math.min(ROSTER.length, 6 + w * 4);
  return ROSTER.slice(0, n);
}

// ─── Bosses ─────────────────────────────────────────────────────────────────
// Two flavours, so a boss leads EVERY THIRD night (not a rare every-5th slog):
//  • apex bosses — the dedicated big horrors, lead the milestone nights
//  • ELITES — ANY roster character, just scaled up + heavily buffed. Cheap to make,
//    so every undead in the cast can show up as a menacing oversized champion.
const BOSSES: IntruderDef[] = [
  { id: 'boneTitan', make: () => MYTHIC.minotaur(), hp: 360, spd: 0.72, bounty: 120, scale: 1.95, legs: true, boss: true },
  { id: 'direWolf', make: () => MONSTERS.werewolf(), hp: 300, spd: 0.96, bounty: 100, scale: 1.85, legs: true, boss: true },
];
// turn any ordinary intruder into a big, beefy, high-bounty elite champion
function eliteFrom(def: IntruderDef): IntruderDef {
  return {
    id: 'elite_' + def.id,
    make: def.make,
    hp: Math.round(def.hp * 4.6),
    spd: def.spd * 0.94,            // heavy → a touch slower than its normal self
    bounty: Math.round(def.bounty * 5 + 20),
    scale: def.scale * 1.7,         // looms over the crowd
    legs: def.legs,
    boss: true,
  };
}

// ─── Entity types ───────────────────────────────────────────────────────────
interface Enemy {
  g: THREE.Group; def: IntruderDef;
  dist: number;            // distance travelled along the winding path
  x: number; z: number;    // current world position (path + perp offset)
  laneOff: number;         // perpendicular offset on the path
  hp: number; maxHp: number; spd: number;
  phase: number; dead: boolean; reached: boolean;
  slow: number; // remaining slow timer (sec)
  poison: number; poisonDps: number; poisonT: number; // VENOM damage-over-time + drip-fx timer
  hpBar: THREE.Sprite | null;
  dying: number; vy: number; spin: number; dustT: number; // death-launch anim + foot dust
  hitFlash: number; hitStop: number; flashOn: boolean;     // damage flinch (flash + brief freeze)
}
interface Tower {
  g: THREE.Group; head: THREE.Group; ring: THREE.Mesh; pips: THREE.Sprite; upArrow: THREE.Sprite;
  type: number; color: number; x: number; z: number; level: number;
  range: number; dmg: number; rate: number; slow: number; splash: number; chillR: number; cd: number; yaw: number;
  chain: number; chainR: number; dot: number; dotTime: number; // STORM chain + VENOM poison
  light?: THREE.PointLight; flicker: number; recoil: number; headY: number;
}
interface Plot { x: number; z: number; disc: THREE.Mesh; marker: THREE.Group; ring: THREE.Mesh; ghost: THREE.Group; tower: Tower | null; unlock: number; live: boolean; }
interface Proj {
  g: THREE.Mesh; x: number; y: number; z: number; tx: number; ty: number; tz: number;
  target: Enemy; dmg: number; slow: number; splash: number; color: number; chill: number;
  dot: number; dotTime: number;                            // VENOM poison carried to the target
  arc: boolean; t: number; flight: number;                 // ballistic (mortar) lob
  sx: number; sy: number; sz: number; ex: number; ey: number; ez: number; arcH: number;
}

export interface HudState { lives: number; cash: number; score: number; wave: number; towers: number; }
export interface SceneHandle { restart: () => void; }

type Mode = 'attract' | 'play' | 'over';
interface Props {
  mode: Mode;
  selectedType: number;
  onHud: (h: HudState) => void;
  onWave: (w: number, boss: boolean) => void;
  onGameOver: (score: number) => void;
  registerRestart: (fn: () => void) => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────
function flatify<T extends THREE.Object3D>(g: T, opts?: { cast?: boolean; receive?: boolean }): T {
  const cast = opts?.cast ?? true;
  const receive = opts?.receive ?? true;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const m = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (m && 'flatShading' in m) { m.flatShading = true; m.needsUpdate = true; }
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
  return g;
}
// the freshly-dead keep their full original colour/identity — the night fog +
// cool moonlight already give plenty of "deceased" mood; graying them just made
// the whole cast read as a grey mush. (Kept as a pass-through hook.)
function paleDead(g: THREE.Group): THREE.Group {
  return g;
}
function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose()); else if (mat) mat.dispose();
  });
}

// tiny HP bar as a sprite (cheap, always faces camera)
function makeHpBar(): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 10;
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.1, 0.17, 1);
  (s as any).__cv = cv; (s as any).__tex = tex;
  return s;
}
function drawHpBar(s: THREE.Sprite, frac: number) {
  const cv = (s as any).__cv as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 64, 10);
  const w = Math.max(0, Math.min(1, frac)) * 60;
  ctx.fillStyle = frac > 0.5 ? '#6ee05a' : frac > 0.25 ? '#ffd23f' : '#ff4b4b';
  ctx.fillRect(2, 2, w, 6);
  (s as any).__tex.needsUpdate = true;
}

// ─── The game world + loop ──────────────────────────────────────────────────
function World({ mode, selectedType, onHud, onWave, onGameOver, registerRestart }: Props) {
  const { scene, camera, gl } = useThree();
  const root = useMemo(() => new THREE.Group(), []);
  const fx = useMemo(() => new THREE.Group(), []);

  // mutable game state
  const S = useRef({
    enemies: [] as Enemy[],
    towers: [] as Tower[],
    projs: [] as Proj[],
    plots: [] as Plot[],
    lives: START_LIVES, cash: START_CASH, score: 0, wave: 0,
    spawnQ: [] as IntruderDef[], spawnT: 0, spawnGap: 1.1,
    waveBreak: 1.2, betweenWaves: true, demoReady: false, attractT: 0,
    houseGroup: null as THREE.Group | null, houseFlash: 0,
    over: false, time: 0,
    lastHud: { lives: -1, cash: -1, score: -1, wave: -1, towers: -1 } as HudState,
    fxLayer: fx as THREE.Group,
    onHud: onHud as (h: HudState) => void,
    motes: null as THREE.Points | null,
    mist: null as THREE.Group | null,
    selectedType: 0,
  });
  S.current.selectedType = selectedType; // keep the chosen weapon in sync each render

  // orbital camera — drag to rotate the board around its centre (azimuth only).
  const CC = useMemo(() => new THREE.Vector3(0, 0, -1.2), []);  // board centre
  const CAM_R = 16.8, CAM_H = 12, CAM_ZOOM = 58;
  const BASE_AZ = Math.atan2(9, 14.2);
  const azimuthRef = useRef(BASE_AZ);
  const applyCam = useCallback(() => {
    const cam = camera as THREE.OrthographicCamera;
    const az = azimuthRef.current;
    cam.position.set(CC.x + CAM_R * Math.sin(az), CAM_H, CC.z + CAM_R * Math.cos(az));
    cam.zoom = CAM_ZOOM; cam.near = 0.1; cam.far = 200;
    cam.lookAt(CC.x, 0.2, CC.z);
    cam.updateProjectionMatrix();
  }, [camera, CC]);
  useEffect(() => { applyCam(); }, [applyCam]);

  // build the static board once
  useEffect(() => {
    scene.add(makeSkyDome());
    scene.fog = new THREE.Fog(0x26303c, 22, 60); // lighter graveyard haze (pushed back so the board reads)
    buildBoard(root, S.current);
    const motes = makeMotes(); scene.add(motes); S.current.motes = motes;
    const mist = makeGroundMist(); scene.add(mist); S.current.mist = mist;
    scene.add(root); scene.add(fx);
    return () => {
      scene.remove(root); scene.remove(fx);
      disposeGroup(root); disposeGroup(fx);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pointer → place / upgrade tower
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const v = new THREE.Vector2();
    let pd: { x: number; y: number; moved: boolean } | null = null;
    // a clean tap (no drag) places/upgrades a tower; a drag rotates the board
    function tap(e: PointerEvent) {
      const st = S.current;
      if (st.over || mode !== 'play') return;
      const r = el.getBoundingClientRect();
      v.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      v.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(v, camera);
      const discs = st.plots.map((p) => p.disc);
      const hits = ray.intersectObjects(discs, false);
      if (!hits.length) return;
      const plot = st.plots.find((p) => p.disc === hits[0].object);
      if (!plot) return;
      if (!plot.live) { bounce(plot.marker); sfx.splat(); return; } // dormant plot — opens on a later night
      if (!plot.tower) {
        const ti = st.selectedType;
        const cost = TOWER_TYPES[ti].cost;
        if (st.cash >= cost) {
          st.cash -= cost;
          plot.tower = plantTower(root, plot, ti);
          st.towers.push(plot.tower);
          plot.marker.visible = false;
          popIn(plot.tower.g);                                   // slam-in pop
          ringPulse(fx, plot.x, plot.z, TOWER_TYPES[ti].color);  // shockwave
          footDust(fx, plot.x, plot.z); footDust(fx, plot.x, plot.z);
          sfx.plant();
          pushHud(st);
        } else { bounce(plot.marker); sfx.splat(); }
      } else {
        const tw = plot.tower;
        if (tw.level >= TOWER_MAX_LVL) { return; }
        const cost = UPGRADE_COST(tw.level);
        if (st.cash >= cost) {
          st.cash -= cost; upgradeTower(tw); sfx.upgrade();
          punch(tw.head);                                  // tower jolts
          deathBurst(fx, tw.x, tw.z, tw.color);            // upward spark burst
          ringPulse(fx, tw.x, tw.z, tw.color);
          pushHud(st);
        } else { bounce(tw.g); sfx.splat(); floatCost(fx, tw.x, tw.z, fmtCost(cost), 0xff5c6b); } // show the price you're short on
      }
    }
    function onDown(e: PointerEvent) { pd = { x: e.clientX, y: e.clientY, moved: false }; }
    function onMove(e: PointerEvent) {
      if (!pd) return;
      const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
      if (!pd.moved && Math.hypot(dx, dy) > 14) pd.moved = true; // higher threshold so taps aren't eaten as drags
      if (pd.moved) { azimuthRef.current -= dx * 0.006; pd.x = e.clientX; pd.y = e.clientY; applyCam(); }
    }
    function onUp(e: PointerEvent) { if (pd && !pd.moved) tap(e); pd = null; }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => { pd = null; });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, camera, gl, applyCam]);

  // restart wiring
  useEffect(() => {
    registerRestart(() => resetGame(root, fx, S.current, onHud));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // entering real play (from attract OR after game over): reset to a clean board
  useEffect(() => {
    if (mode !== 'play') return;
    const st = S.current;
    resetGame(root, fx, st, onHud);
    // showcase: place every weapon at levels 1/2/3/4 to compare the form evolution
    if (typeof location !== 'undefined' && location.search.includes('showcase')) {
      const rows: [number, number][] = [[0, 0], [2, 0], [4, 0], [6, 0], [1, 1], [3, 1], [5, 1], [7, 1]];
      const plan: [number, number, number][] = [ // plotIdx, type, level
        [0, 0, 1], [2, 0, 2], [4, 0, 3], [6, 0, 4],
        [1, 1, 1], [3, 1, 2], [5, 1, 4],
        [7, 2, 4], [8, 2, 2],
        [9, 3, 2], [11, 3, 4],   // STORM coils
        [10, 4, 2], [12, 4, 4],  // VENOM urns
      ];
      void rows;
      plan.forEach(([idx, ty, lvl]) => {
        const plot = st.plots[idx];
        if (plot && !plot.tower) {
          plot.tower = plantTower(root, plot, ty);
          for (let k = 1; k < lvl; k++) upgradeTower(plot.tower);
          st.towers.push(plot.tower); plot.marker.visible = false;
        }
      });
      return;
    }
    // debug: after the reset, pre-plant towers + scatter intruders for a combat shot
    if (typeof location !== 'undefined' && location.search.includes('debug')) {
      [[2, 0], [3, 2], [1, 1], [6, 0]].forEach(([idx, ty]) => {
        const plot = st.plots[idx];
        if (plot && !plot.tower) {
          plot.tower = plantTower(root, plot, ty);
          if (idx === 3) { upgradeTower(plot.tower); upgradeTower(plot.tower); }
          st.towers.push(plot.tower); plot.marker.visible = false;
        }
      });
      startWave(st, onWave);
      const dbgPool = poolForWave(3);
      [0.12, 0.3, 0.48, 0.66, 0.84].forEach((frac, i) => {
        spawnEnemy(root, st, dbgPool[i % dbgPool.length]);
        st.enemies[st.enemies.length - 1].dist = frac * PATH_TOTAL;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ─── main loop ───
  useFrame((_, dtRaw) => {
    const st = S.current;
    const dt = Math.min(dtRaw, 0.05);
    st.time += dt;

    if (st.motes) { st.motes.rotation.y += dt * 0.02; st.motes.position.y = Math.sin(st.time * 0.3) * 0.14; }
    if (st.mist) {
      for (const m of st.mist.children) {
        m.position.x += (m as any).__sp * (m as any).__dir * dt;
        m.rotation.z += dt * 0.04 * (m as any).__dir;
        if (m.position.x > 5) (m as any).__dir = -1;
        if (m.position.x < -5) (m as any).__dir = 1;
      }
    }

    // build sockets: bright glowing ring + floating ghost flame when affordable,
    // dim when you can't yet pay — so "when you can build" reads at a glance
    for (const p of st.plots) {
      if (p.tower) { p.marker.visible = false; continue; }
      if (!p.live) {
        // a dormant future plot — a faint dim ring (no glow, no ghost) so you can
        // see new ground will open here, but it isn't buildable yet
        p.marker.visible = true;
        const rm = p.ring.material as THREE.MeshBasicMaterial;
        rm.color.setHex(0x46504a); rm.opacity = 0.16;
        p.ring.scale.setScalar(0.8);
        p.ghost.visible = false;
        continue;
      }
      const aff = st.cash >= TOWER_TYPES[st.selectedType].cost;
      p.marker.visible = true;
      const rm = p.ring.material as THREE.MeshBasicMaterial;
      if (aff) {
        const pulse = 0.6 + Math.sin(st.time * 3.2 + p.x) * 0.28;
        rm.color.setHex(0x79e0ad); rm.opacity = pulse;
        p.ring.scale.setScalar(1 + Math.sin(st.time * 3.2 + p.x) * 0.06);
        p.ghost.visible = true;
        p.ghost.position.y = Math.sin(st.time * 2 + p.x) * 0.07;
      } else {
        rm.color.setHex(0x5a6b62); rm.opacity = 0.22;
        p.ring.scale.setScalar(0.9);
        p.ghost.visible = false;
      }
    }

    if (st.houseFlash > 0 && st.houseGroup) {
      st.houseFlash -= dt;
      st.houseGroup.position.x = Math.sin(st.time * 60) * st.houseFlash * 0.12;
    }

    const isPlay = mode === 'play' && !st.over;
    const isAttract = mode === 'attract';
    if (!isPlay && !isAttract) { renderFx(fx, dt); return; }

    if (isAttract) {
      // live attract demo: pre-place a couple of sprinklers, trickle intruders
      if (!st.demoReady) {
        [[2, 0], [3, 2], [6, 1]].forEach(([idx, ty]) => {
          const plot = st.plots[idx];
          if (plot && !plot.tower) {
            plot.tower = plantTower(root, plot, ty);
            if (idx === 3) upgradeTower(plot.tower);
            st.towers.push(plot.tower); plot.marker.visible = false;
          }
        });
        st.demoReady = true;
      }
      st.attractT -= dt;
      if (st.attractT <= 0 && st.enemies.length < 6) {
        const pool = poolForWave(2);
        spawnEnemy(root, st, pool[Math.floor(Math.random() * pool.length)]);
        st.attractT = 1.5;
      }
    } else {
      // ── real wave director ──
      if (st.betweenWaves) {
        st.waveBreak -= dt;
        if (st.waveBreak <= 0) startWave(st, onWave);
      } else {
        st.spawnT -= dt;
        if (st.spawnT <= 0 && st.spawnQ.length) {
          const def = st.spawnQ.shift()!;
          spawnEnemy(root, st, def);
          st.spawnT = st.spawnGap;
        }
        if (!st.spawnQ.length && st.enemies.length === 0) {
          st.betweenWaves = true;
          st.waveBreak = 2.6;
        }
      }
    }

    // ── enemies march along the winding path ──
    for (const en of st.enemies) {
      if (en.dying > 0) { // death-launch animation (corpse flies + shrinks)
        en.dying -= dt;
        en.vy -= 16 * dt;
        en.g.position.y = Math.max(0, en.g.position.y + en.vy * dt);
        en.g.rotation.z += en.spin * dt;
        en.g.scale.multiplyScalar(Math.max(0, 1 - dt * 2.4));
        continue;
      }
      if (en.dead) continue;
      // VENOM poison — drains HP over time even after the urn stops firing
      if (en.poison > 0) {
        en.poison -= dt;
        en.hp -= en.poisonDps * dt;
        if (en.hpBar) drawHpBar(en.hpBar, en.hp / en.maxHp);
        en.poisonT -= dt;
        if (en.poisonT <= 0) { splash(fx, en.x, 0.55, en.z, 0x9be83a); en.poisonT = 0.32; }
        if (en.hp <= 0) { killEnemy(st, en, root); continue; }
      }
      let spd = en.spd;
      if (en.slow > 0) { en.slow -= dt; spd *= 0.5; }
      if (en.hitStop > 0) { en.hitStop -= dt; spd = 0; }  // momentary stagger
      en.dist += spd * dt;
      en.phase += dt * spd * 3.2;
      const p = posAlong(en.dist);
      en.x = p.x + p.px * en.laneOff;
      en.z = p.z + p.pz * en.laneOff;
      const bob = en.def.legs ? Math.abs(Math.sin(en.phase)) * 0.04 : Math.abs(Math.sin(en.phase)) * 0.09;
      en.g.position.set(en.x, bob, en.z);
      en.g.rotation.y = Math.atan2(p.dx, p.dz); // face along the path
      // walk anim
      if (en.def.legs) {
        const rig = rigOf(en.g);
        const sw = Math.sin(en.phase) * 0.5;
        if (rig?.legL) rig.legL.rotation.x = sw;
        if (rig?.legR) rig.legR.rotation.x = -sw;
        if (rig?.armL) rig.armL.rotation.x = -sw * 0.7;
        if (rig?.armR) rig.armR.rotation.x = sw * 0.7;
      }
      if (en.hpBar) en.hpBar.position.set(en.x, 1.5 * en.def.scale * ENEMY_SCALE + 0.9, en.z);
      // foot dust kicked up as they shamble (bipeds only; ghosts float)
      if (en.def.legs && en.hitStop <= 0) { en.dustT -= dt; if (en.dustT <= 0) { footDust(fx, en.x, en.z); en.dustT = 0.2; } }
      // reached the crypt
      if (en.dist >= PATH_TOTAL) {
        en.reached = true; en.dead = true;
        if (isAttract) { continue; } // demo: harmless, no life loss
        st.lives -= 1; st.houseFlash = 0.5; sfx.reachHouse();
        if (st.lives <= 0) endGame(st, onGameOver);
        pushHud(st);
      }
    }

    // ── towers target + fire ──
    for (const tw of st.towers) {
      tw.cd -= dt;
      // brazier flame flicker → restless pool of light
      tw.flicker += dt * 11;
      if (tw.light) tw.light.intensity = (5 + tw.level * 1.6) * (0.78 + 0.22 * Math.sin(tw.flicker) + 0.08 * Math.sin(tw.flicker * 2.7));
      // "can upgrade now" cue — a bobbing gold up-arrow when you can afford it
      // always show the next-upgrade cost when below the ceiling — BRIGHT + bobbing
      // when you can afford it, DIMMED + still when you can't (so a cost wall reads
      // as "needs more souls", never as a broken/locked tower).
      const notMax = !isAttract && tw.level < TOWER_MAX_LVL;
      tw.upArrow.visible = notMax;
      if (notMax) {
        const afford = st.cash >= UPGRADE_COST(tw.level);
        (tw.upArrow.material as THREE.SpriteMaterial).opacity = afford ? 1 : 0.4;
        tw.upArrow.position.y = 2.12 + (afford ? Math.sin(st.time * 4 + tw.x) * 0.09 : 0);
        const p = afford ? 1 + 0.1 * Math.sin(st.time * 6) : 0.78;
        tw.upArrow.scale.set(0.92 * p, 0.69 * p, 1);
      }
      // in-range enemy that is furthest along the path (closest to the crypt)
      let best: Enemy | null = null; let bestD = -Infinity;
      for (const en of st.enemies) {
        if (en.dead) continue;
        const dx = en.x - tw.x, dz = en.z - tw.z;
        if (dx * dx + dz * dz <= tw.range * tw.range && en.dist > bestD) { best = en; bestD = en.dist; }
      }
      if (best) {
        const desired = Math.atan2(best.x - tw.x, best.z - tw.z);
        tw.yaw += angDelta(tw.yaw, desired) * Math.min(1, dt * 14);
        tw.head.rotation.y = tw.yaw;
        if (tw.cd <= 0) {
          tw.cd = 1 / tw.rate;
          fireWater(fx, st, tw, best);
          tw.recoil = tw.splash > 0 ? 0.2 : 0.12; // a kick when it shoots
          const k = TOWER_TYPES[tw.type].head;
          if (k === 'flame') sfx.fire(); else if (k === 'crystal') sfx.frost();
          else if (k === 'coil') sfx.storm(); else if (k === 'urn') sfx.plague(); else sfx.mortar();
        }
      }
      // recoil decay — the head kicks back along its aim, then settles
      if (tw.recoil > 0) tw.recoil = Math.max(0, tw.recoil - dt * 1.4);
      tw.head.position.set(-Math.sin(tw.yaw) * tw.recoil, tw.headY, -Math.cos(tw.yaw) * tw.recoil);
    }

    // ── projectiles ──
    for (const pr of st.projs) {
      if (pr.arc) {
        // MORTAR — ballistic lob to the ground spot, then a big splash blast
        pr.t += dt / pr.flight;
        if (pr.t >= 1) {
          splashHit(st, root, pr.ex, pr.ez, pr.splash, pr.dmg, pr.slow);
          ringPulse(fx, pr.ex, pr.ez, pr.color);
          splash(fx, pr.ex, 0.4, pr.ez, pr.color); splash(fx, pr.ex, 0.4, pr.ez, pr.color);
          sfx.boom();
          pr.x = 1e9;
        } else {
          const u = pr.t;
          pr.x = pr.sx + (pr.ex - pr.sx) * u;
          pr.z = pr.sz + (pr.ez - pr.sz) * u;
          pr.y = pr.sy + (pr.ey - pr.sy) * u + pr.arcH * Math.sin(u * Math.PI);
          pr.g.position.set(pr.x, pr.y, pr.z);
          pr.g.rotation.x += dt * 9; pr.g.rotation.z += dt * 6; // tumbling shell
        }
        continue;
      }
      // FIRE / FROST — home in fast on the target
      const en = pr.target;
      if (!en.dead) { pr.tx = en.x; pr.tz = en.z; pr.ty = 0.5; }
      const dx = pr.tx - pr.x, dy = pr.ty - pr.y, dz = pr.tz - pr.z;
      const d = Math.hypot(dx, dy, dz);
      const step = 18 * dt;
      if (d <= step || en.dead) {
        if (!en.dead) {
          en.hp -= pr.dmg; en.slow = Math.max(en.slow, pr.slow); hitReact(en, pr.dmg);
          // VENOM — stamp a poison that keeps ticking the enemy down (refresh, keep strongest)
          if (pr.dot > 0) { en.poisonDps = Math.max(en.poisonDps, pr.dot); en.poison = Math.max(en.poison, pr.dotTime); }
          if (en.hpBar) drawHpBar(en.hpBar, en.hp / en.maxHp);
          if (en.hp <= 0) killEnemy(st, en, root);
        }
        // FROST chills a small area — slow (no damage) everyone nearby + a frost ring
        if (pr.chill > 0) {
          for (const e of st.enemies) {
            if (e.dead || e === en) continue;
            const cx = e.x - pr.x, cz = e.z - pr.z;
            if (cx * cx + cz * cz <= pr.chill * pr.chill) e.slow = Math.max(e.slow, pr.slow);
          }
          ringPulse(fx, pr.x, pr.z, pr.color);
        }
        splash(fx, pr.x, 0.4, pr.z, pr.color);
        pr.x = 1e9;
      } else {
        pr.x += (dx / d) * step; pr.y += (dy / d) * step; pr.z += (dz / d) * step;
        pr.g.position.set(pr.x, pr.y, pr.z);
        pr.g.lookAt(pr.tx, pr.ty, pr.tz); // orient the icy shard along its flight
      }
    }
    // cull
    st.projs = st.projs.filter((pr) => {
      if (pr.x > 1e8) { fx.remove(pr.g); disposeGroup(pr.g); return false; }
      return true;
    });
    st.enemies = st.enemies.filter((en) => {
      if (en.dead && en.dying <= 0) {
        if (en.hpBar) { fx.remove(en.hpBar); }
        root.remove(en.g); disposeGroup(en.g);
        return false;
      }
      return true;
    });

    renderFx(fx, dt);
  });

  return null;
}

// ─── board construction ─────────────────────────────────────────────────────
function buildBoard(root: THREE.Group, st: any) {
  // dark mossy graveyard ground — extends well past the frame so no island edge
  // shows; the far reaches fade into the fog
  const base = box(46, 0.5, 52, 0x36402f, 0, -0.25, -3);
  flatify(base, { cast: false, receive: true }); root.add(base);
  // mossy darker blotches scattered across the visible ground for texture
  for (let k = 0; k < 30; k++) {
    const mx = ((k * 4.7) % 13) - 6.5, mz = SPAWN_Z - 1 + ((k * 2.3) % 16);
    if (Math.abs(mx) < 1.2 && mz < HOUSE_Z) continue; // keep the path clear
    const moss = box(0.7 + (k % 3) * 0.4, 0.02, 0.6 + (k % 2) * 0.5, k % 2 ? 0x2c3626 : 0x3f4a33, mx, 0.02, mz);
    flatify(moss, { cast: false, receive: true }); root.add(moss);
  }

  // paved flagstone path — laid as actual tiles so it clearly reads as the route
  // (dark grout base band + alternating pale flagstones; no glow lines)
  for (const s of PATH_SEGS) {
    const midx = s.ax + s.dx * s.len / 2, midz = s.az + s.dz * s.len / 2;
    const grout = box(1.7, 0.1, s.len + 0.5, 0x2b2f27, midx, 0.05, midz);
    grout.rotation.y = Math.atan2(s.dx, s.dz);
    flatify(grout, { cast: false, receive: true }); root.add(grout);
  }
  for (let i = 1; i < PATH.length - 1; i++) {        // grout base at the U-turns
    const fill = box(1.7, 0.1, 1.7, 0x2b2f27, PATH[i][0], 0.048, PATH[i][1]);
    flatify(fill, { cast: false, receive: true }); root.add(fill);
  }
  let ti = 0;
  for (let d = 0; d <= PATH_TOTAL + 0.01; d += 1.34, ti++) {
    const p = posAlong(d);
    const c = ti % 2 ? 0x9b9d85 : 0x7f8170;          // alternating flagstone shades
    const tile = box(1.5, 0.14, 1.18, c, p.x, 0.11, p.z);
    tile.rotation.y = Math.atan2(p.dx, p.dz);
    flatify(tile, { cast: false, receive: true }); root.add(tile);
  }

  // dead-grass tufts beside the path
  for (let k = 0; k < 24; k++) {
    const ang = (k * 2.4) % 1;
    const x = (ang < 0.5 ? -1 : 1) * (1.7 + (k % 4) * 0.42);
    const z = SPAWN_Z + (k * 0.55) % 12;
    const tuft = box(0.1, 0.2 + (k % 3) * 0.06, 0.1, 0x5a5734, x, 0.1, z);
    flatify(tuft); root.add(tuft);
  }

  // the CRYPT = the grave you defend (just behind the lane's end)
  const crypt = makeCrypt();
  crypt.position.set(0, 0, HOUSE_Z + 0.8);
  root.add(crypt); st.houseGroup = crypt;

  // graveyard lamp-posts flanking the crypt — each casts a soft warm pool
  for (const sx of [-1, 1]) {
    const lp = lamp(); lp.scale.setScalar(1.45);
    lp.position.set(sx * 2.4, 0, HOUSE_Z + 0.6); lp.rotation.y = sx < 0 ? Math.PI : 0;
    flatify(lp); root.add(lp);
    const warm = new THREE.PointLight(0xffc27a, 5.5, 4.6, 2);
    warm.position.set(sx * 2.4 + sx * 0.44, 1.5, HOUSE_Z + 0.6); warm.castShadow = false;
    root.add(warm);
  }
  // a standing lantern part-way down the path — another warm anchor
  {
    const lp = lamp(); lp.scale.setScalar(1.3);
    lp.position.set(-3.3, 0, -1.0); flatify(lp); root.add(lp);
    const warm = new THREE.PointLight(0xffc27a, 4.5, 4.2, 2);
    warm.position.set(-3.0, 1.35, -1.0); warm.castShadow = false; root.add(warm);
  }
  // scattered grave-candles — emissive only (bloom glow, no light cost) for warm sparkle
  const candleSpots: [number, number][] = [
    [-2.6, -3.4], [2.6, -3.0], [3.2, -1.0], [-3.2, -0.4], [2.6, 2.0], [-2.5, 1.6], [-3.6, -4.6],
  ];
  for (const [cx, cz] of candleSpots) {
    const stick = box(0.07, 0.18, 0.07, 0xd8cdb0, cx, 0.24, cz); flatify(stick); root.add(stick);
    const flame = ball(0.06, 0xffd089, cx, 0.36, cz, 0);
    const fm = flame.material as THREE.MeshStandardMaterial;
    fm.emissive = new THREE.Color(0xffb45a); fm.emissiveIntensity = 1.8; flame.castShadow = false;
    root.add(flame);
  }

  // rusted iron fence along the back
  for (let i = -4; i <= 4; i++) {
    const f = fence(); f.position.set(i * 1.0, 0, SPAWN_Z - 0.1); f.scale.set(1, 1.15, 1);
    darkenGroup(f, 0x20221f, 0.7);
    flatify(f); root.add(f);
  }

  // scattered gravestones + bare dead trees flanking the path
  const graveSpots: [number, number][] = [
    [-2.6, -3.4], [2.6, -3.0], [-3.2, -0.4], [3.2, -1.0], [-2.5, 1.6], [2.6, 2.0],
    [-3.6, -4.6], [3.6, 0.8], [-2.4, 3.2],
  ];
  graveSpots.forEach(([x, z], i) => {
    const gs = makeGravestone(i);
    gs.position.set(x, 0, z); gs.rotation.y = (i * 0.7) % 0.5 - 0.25;
    root.add(gs);
  });
  const treeSpots: [number, number, string][] = [
    [-4.2, HOUSE_Z + 0.6, 'pine'], [4.2, SPAWN_Z + 1.2, 'roundTree'],
    [-4.3, -2.2, 'roundTree'], [4.3, HOUSE_Z - 0.4, 'pine'],
  ];
  for (const [x, z, kind] of treeSpots) {
    const pl = PLANTS[kind](); pl.position.set(x, 0, z); pl.scale.setScalar(1.15);
    darkenGroup(pl, 0x1c2418, 0.66);   // dead/bare silhouette
    flatify(pl); root.add(pl);
  }

  // tower plots — each on a mossy stone build-pad (reads as an intentional pedestal)
  for (const [x, z, unlock] of PLOT_SPECS) {
    root.add(makePad(x, z));
    const plot = makePlot(x, z, unlock);
    root.add(plot.disc); root.add(plot.marker);
    st.plots.push(plot);
  }
}

function makePad(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(flatify(box(0.92, 0.12, 0.92, 0x4e554a, 0, 0.06, 0), { cast: false, receive: true }));
  g.add(flatify(box(0.78, 0.1, 0.78, 0x646b5b, 0, 0.13, 0), { cast: false, receive: true }));
  // a touch of moss on two corners
  g.add(flatify(box(0.3, 0.03, 0.22, 0x47592f, -0.22, 0.19, 0.2), { cast: false, receive: true }));
  return g;
}

// blend every material in a group toward a target colour (darken/tint for the night)
function darkenGroup(g: THREE.Object3D, hex: number, amt: number) {
  const target = new THREE.Color(hex);
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && m.color) m.color.lerp(target, amt);
  });
}

// ─── bespoke graveyard props ─────────────────────────────────────────────────
function makeCrypt(): THREE.Group {
  const g = new THREE.Group();
  const stone = 0x73776f, stoneL = 0x848980, stoneD = 0x4e524b, dark = 0x100f0c, iron = 0x232420;
  // stepped plinth (two steps — reads as a built monument, not a box)
  g.add(flatify(box(1.62, 0.16, 1.4, stoneD, 0, 0.08, 0)));
  g.add(flatify(box(1.34, 0.14, 1.16, stone, 0, 0.22, 0)));
  // body — compact chamber
  g.add(flatify(box(1.16, 0.92, 0.96, stone, 0, 0.72, 0)));
  // string course (lighter trim band) for detail
  g.add(flatify(box(1.22, 0.08, 1.02, stoneL, 0, 1.12, 0)));
  // two front columns flanking the doorway
  for (const sx of [-1, 1]) {
    g.add(flatify(cyl(0.1, 0.11, 0.78, 10, stoneL, sx * 0.44, 0.66, 0.5)));
    g.add(flatify(box(0.2, 0.08, 0.2, stoneL, sx * 0.44, 1.08, 0.5)));   // capital
    g.add(flatify(box(0.2, 0.08, 0.2, stoneD, sx * 0.44, 0.29, 0.5)));   // base
  }
  // arched doorway: dark recess + warm-lit interior + iron bars
  g.add(flatify(box(0.5, 0.78, 0.12, dark, 0, 0.62, 0.46)));
  g.add(flatify(cyl(0.25, 0.25, 0.12, 12, dark, 0, 1.0, 0.46), { cast: false }));
  const glow = box(0.4, 0.62, 0.05, 0xffb060, 0, 0.58, 0.49, { e: 0xffb060, ei: 1.1 });
  glow.castShadow = false; g.add(glow);
  for (const bx of [-0.12, 0, 0.12])                                     // iron gate bars
    g.add(flatify(box(0.03, 0.74, 0.03, iron, bx, 0.62, 0.53), { cast: false }));
  // warm soft light spilling from the tomb (ask #1 — warm source)
  const warm = new THREE.PointLight(0xffb774, 7, 4.2, 2);
  warm.position.set(0, 0.7, 0.9); warm.castShadow = false; g.add(warm);
  // low-pitched gabled roof + cross finial
  const roof = cone(1.0, 0.5, 4, stoneD, 0, 1.42, 0); roof.rotation.y = Math.PI / 4; g.add(flatify(roof));
  g.add(flatify(box(0.1, 0.42, 0.1, stoneL, 0, 1.86, 0)));
  g.add(flatify(box(0.28, 0.1, 0.1, stoneL, 0, 1.92, 0)));
  // weathered urns on the plinth corners
  for (const sx of [-1, 1]) {
    g.add(flatify(cyl(0.1, 0.07, 0.18, 8, stoneD, sx * 0.56, 0.32, 0.42)));
  }
  g.scale.setScalar(0.92);
  return g;
}
function makeGravestone(i: number): THREE.Group {
  const g = new THREE.Group();
  const stone = i % 3 === 0 ? 0x5d6058 : i % 3 === 1 ? 0x676a61 : 0x55584f;
  if (i % 4 === 0) {                                  // cross headstone
    g.add(flatify(box(0.16, 0.74, 0.14, stone, 0, 0.42, 0)));
    g.add(flatify(box(0.46, 0.16, 0.14, stone, 0, 0.56, 0)));
  } else {                                            // rounded slab
    g.add(flatify(box(0.46, 0.72, 0.16, stone, 0, 0.4, 0)));
    g.add(flatify(cyl(0.23, 0.23, 0.16, 12, stone, 0, 0.76, 0)));
  }
  g.add(flatify(box(0.6, 0.12, 0.36, 0x4a4d45, 0, 0.06, 0.04)));    // base
  g.scale.setScalar(0.95 + (i % 3) * 0.12);
  return g;
}

function makePlot(x: number, z: number, unlock = 0): Plot {
  // tap target = a tall invisible COLUMN (not a flat disc) so tapping either the
  // ground socket OR the tower that stands on it both register — this is what
  // made placing/upgrading hard. Stays visible:true (raycaster skips visible:false)
  // but fully transparent.
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 1.2, 12),   // shorter column → covers socket + tower base without towering into neighbours (less mis-select)
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  disc.position.set(x, 0.55, z);

  // build-socket marker: a glowing spectral ring on the pad + a floating ghost
  // brazier-flame preview (shown only when affordable → "a brazier goes here").
  const marker = new THREE.Group();
  marker.position.set(x, 0, z);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.52, 28),
    new THREE.MeshBasicMaterial({ color: 0x79e0ad, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.22;
  marker.add(ring);

  const ghost = new THREE.Group();
  const beam = box(0.05, 0.32, 0.05, 0x79e0ad, 0, 0.24, 0, { e: 0x4fc88c, ei: 0.5 });
  (beam.material as THREE.MeshStandardMaterial).transparent = true;
  (beam.material as THREE.MeshStandardMaterial).opacity = 0.5; beam.castShadow = false;
  ghost.add(beam);
  const orb = ball(0.15, 0x8ff0c4, 0, 0.5, 0, 1);
  const om = orb.material as THREE.MeshStandardMaterial;
  om.emissive = new THREE.Color(0x6fe0a8); om.emissiveIntensity = 1.1;
  om.transparent = true; om.opacity = 0.78; orb.castShadow = false;
  ghost.add(orb);
  marker.add(ghost);

  return { x, z, disc, marker, ring, ghost, tower: null, unlock, live: unlock <= 0 };
}

// ─── towers ─────────────────────────────────────────────────────────────────
// ── Weapon types — three clear roles (the build tray shows these) ────────────
export interface TowerType {
  id: string; name: string; cost: number; color: number;
  range: number; dmg: number; rate: number; slow: number; splash: number; chillR: number;
  head: 'flame' | 'crystal' | 'mortar' | 'coil' | 'urn';
  unlock: number;        // night this weapon becomes buildable (0 = from the very start)
  chain?: number;        // STORM: how many extra enemies the bolt arcs to
  chainR?: number;       // STORM: arc reach between links
  dot?: number;          // VENOM: poison damage per second applied on hit
  dotTime?: number;      // VENOM: poison duration (sec)
  blurb: string;
}
// Five weapons now. The first three are open from the start; STORM and VENOM
// unlock on later nights, so the late game keeps handing you NEW tools (not just
// "upgrade the same three"). Each fills a distinct combat role.
export const TOWER_TYPES: TowerType[] = [
  // fast cheap single-target DPS — Ember
  { id: 'brazier', name: 'Fire Cannon', cost: 80, color: 0xff8a3c, range: 2.7, dmg: 7, rate: 3.0, slow: 0.2, splash: 0, chillR: 0, head: 'flame', unlock: 0, blurb: 'Rapid fireballs' },
  // control: low damage, strong slow + chills a small area — Frost
  { id: 'frost', name: 'Frost Lance', cost: 110, color: 0x8fe0ff, range: 2.7, dmg: 5, rate: 1.2, slow: 2.4, splash: 0, chillR: 1.2, head: 'crystal', unlock: 0, blurb: 'Slows & chills' },
  // heavy slow-firing artillery: lobbed AoE blast — Haunt
  { id: 'mortar', name: 'Bone Mortar', cost: 160, color: 0xc79bf0, range: 3.3, dmg: 22, rate: 0.55, slow: 0.3, splash: 1.5, chillR: 0, head: 'mortar', unlock: 0, blurb: 'Lobbed splash blast' },
  // STORM — chain lightning that leaps between clustered dead (shreds packs) — unlocks night 4
  { id: 'storm', name: 'Storm Coil', cost: 200, color: 0xffe24d, range: 3.0, dmg: 11, rate: 1.5, slow: 0, splash: 0, chillR: 0, head: 'coil', unlock: 4, chain: 2, chainR: 2.0, blurb: 'Chain lightning' },
  // VENOM — sprays a plague that ticks even the beefiest elites down over time — unlocks night 8
  { id: 'venom', name: 'Plague Urn', cost: 240, color: 0x9be83a, range: 2.9, dmg: 6, rate: 1.1, slow: 0, splash: 0, chillR: 0, head: 'urn', unlock: 8, dot: 16, dotTime: 4, blurb: 'Poison over time' },
];

function plantTower(root: THREE.Group, plot: Plot, typeIdx: number): Tower {
  const T = TOWER_TYPES[typeIdx];
  const g = new THREE.Group();
  g.position.set(plot.x, 0, plot.z);
  const plinth = cyl(0.46, 0.54, 0.2, 8, 0x474b46, 0, 0.1, 0); flatify(plinth); g.add(plinth);
  const post = cyl(0.12, 0.14, 0.44, 8, 0x2a2c29, 0, 0.42, 0); flatify(post); g.add(post);
  // the MOUNT differs by weapon so each reads as a different object, not a clone
  if (T.head === 'flame') {            // a wide iron brazier pit
    const bowl = cyl(0.36, 0.22, 0.2, 12, 0x23241f, 0, 0.72, 0); flatify(bowl); g.add(bowl);
    const lip = cyl(0.38, 0.36, 0.06, 12, 0x3a3d36, 0, 0.82, 0); flatify(lip); g.add(lip);
  } else if (T.head === 'crystal') {   // a tapered stone pillar
    const pil = box(0.26, 0.34, 0.26, 0x3c4248, 0, 0.66, 0); flatify(pil); g.add(pil);
    const cap = cone(0.22, 0.16, 4, 0x4a5158, 0, 0.9, 0); flatify(cap); g.add(cap);
  } else if (T.head === 'coil') {       // STORM — an insulated iron base for the tesla rod
    const drum = cyl(0.3, 0.34, 0.26, 10, 0x33373a, 0, 0.7, 0); flatify(drum); g.add(drum);
    const cap = cyl(0.16, 0.22, 0.1, 10, 0x4a5158, 0, 0.86, 0); flatify(cap); g.add(cap);
  } else if (T.head === 'urn') {        // VENOM — a stone basin cradling the plague urn
    const basin = cyl(0.34, 0.26, 0.18, 10, 0x33402c, 0, 0.72, 0); flatify(basin); g.add(basin);
    const rim = cyl(0.36, 0.34, 0.06, 10, 0x46562f, 0, 0.83, 0); flatify(rim); g.add(rim);
  } else {                              // a heavy armoured gun platform
    const blk = box(0.46, 0.22, 0.46, 0x3a3d36, 0, 0.7, 0); flatify(blk); g.add(blk);
  }
  const head = new THREE.Group(); head.position.y = T.head === 'flame' ? 0.78 : 0.86; g.add(head);
  const light = new THREE.PointLight(T.color, 6, 3.4, 2);
  light.position.set(0, 1.0, 0); light.castShadow = false; g.add(light);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.1, 28),
    new THREE.MeshBasicMaterial({ color: T.color, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const pips = makePips(); pips.position.set(0, 1.62, 0); g.add(pips);
  const upArrow = makeUpArrow(); upArrow.position.set(0, 2.02, 0); upArrow.visible = false; g.add(upArrow);
  root.add(g);
  const tw: Tower = {
    g, head, ring, pips, upArrow, type: typeIdx, x: plot.x, z: plot.z, level: 1,
    range: T.range, dmg: T.dmg, rate: T.rate, slow: T.slow, splash: T.splash, chillR: T.chillR,
    chain: T.chain || 0, chainR: T.chainR || 0, dot: T.dot || 0, dotTime: T.dotTime || 0,
    color: T.color, cd: 0, yaw: 0, light, flicker: Math.random() * 6,
    recoil: 0, headY: head.position.y,
  };
  applyTowerLevel(tw);
  return tw;
}

function emis(m: THREE.Mesh, color: number, ei: number) {
  const mm = m.material as THREE.MeshStandardMaterial;
  mm.emissive = new THREE.Color(color); mm.emissiveIntensity = ei; m.castShadow = false;
}
// a sharp faceted ice spike (4-sided pyramid up + short pyramid down = a crystal)
function crystalSpike(head: THREE.Group, r: number, h: number, x: number, y: number, z: number, color: number, tilt = 0) {
  const up = cone(r, h, 4, color, x, y + h * 0.3, z);
  const dn = cone(r, h * 0.42, 4, color, x, y - h * 0.08, z); dn.rotation.z = Math.PI;
  if (tilt) { up.rotation.z = Math.cos(tilt) * 0.34; up.rotation.x = Math.sin(tilt) * 0.34; }
  up.rotation.y = 0.6; dn.rotation.y = 0.6;
  emis(up, color, 1.35); emis(dn, color, 1.35); head.add(up); head.add(dn);
}
// rebuild the head per type + level. Each weapon has a DISTINCT silhouette:
// fire = round billowing flames, frost = angular crystals, mortar = cannon barrels.
function rebuildHead(tw: Tower) {
  const head = tw.head;
  for (const c of [...head.children]) { head.remove(c); disposeGroup(c); }
  const shape = TOWER_TYPES[tw.type].head, lv = Math.min(TOWER_VFORM_MAX, tw.level), col = tw.color;
  if (shape === 'flame') flameHead(head, lv, col);
  else if (shape === 'crystal') crystalHead(head, lv, col);
  else if (shape === 'coil') coilHead(head, lv, col);
  else if (shape === 'urn') urnHead(head, lv, col);
  else mortarHead(head, lv, col);
  head.scale.setScalar(1); // keep the head anchored — deep levels read via the LV badge + brighter light
}
// STORM — a tesla rod topped by a glowing sphere, with prongs that multiply each
// level (1 → cross of 2 → 4-prong ring → caged dome). Distinct vertical silhouette.
function coilHead(head: THREE.Group, lv: number, col: number) {
  const rod = cyl(0.05, 0.07, 0.3 + lv * 0.05, 6, 0x5a6066, 0, 0.15 + lv * 0.025, 0); flatify(rod); head.add(rod);
  const orbY = 0.32 + lv * 0.05;
  const orb = ball(0.12 + lv * 0.018, col, 0, orbY, 0, 1); orb.castShadow = false; emis(orb, col, 2.0); head.add(orb);
  const prongs = lv <= 1 ? 0 : lv === 2 ? 2 : lv === 3 ? 4 : 6;
  for (let i = 0; i < prongs; i++) {
    const a = (i / prongs) * Math.PI * 2;
    const px = Math.cos(a) * 0.2, pz = Math.sin(a) * 0.2;
    const pr = cyl(0.022, 0.022, 0.22, 5, 0x71777d, px, orbY, pz, { e: col, ei: 0.4 });
    pr.rotation.z = Math.cos(a) * 0.5; pr.rotation.x = -Math.sin(a) * 0.5; flatify(pr); head.add(pr);
    const tip = ball(0.04, col, px * 1.5, orbY + 0.12, pz * 1.5, 0); tip.castShadow = false; emis(tip, col, 1.6); head.add(tip);
  }
  if (lv >= 4) { const halo = cyl(0.3, 0.3, 0.03, 14, col, 0, orbY, 0); halo.rotation.x = Math.PI / 2; emis(halo, col, 0.7); head.add(halo); }
}
// VENOM — a bubbling urn with a venom dome; level adds spouts + a thicker rim of
// dripping toxin. Distinct rounded, organic silhouette (vs angular crystal/coil).
function urnHead(head: THREE.Group, lv: number, col: number) {
  const body = cyl(0.16 + lv * 0.01, 0.1, 0.26 + lv * 0.02, 10, 0x2f3a24, 0, 0.13, 0); flatify(body); head.add(body);
  const brew = ball(0.16 + lv * 0.014, col, 0, 0.28 + lv * 0.012, 0, 1); brew.castShadow = false; emis(brew, col, 1.5); head.add(brew);
  const bubbles = 1 + lv;
  for (let i = 0; i < bubbles; i++) {
    const a = (i / bubbles) * Math.PI * 2 + lv;
    const b = ball(0.04 + (i % 2) * 0.02, col, Math.cos(a) * 0.1, 0.34 + lv * 0.02, Math.sin(a) * 0.1, 0);
    b.castShadow = false; emis(b, col, 1.7); head.add(b);
  }
  const spouts = lv <= 1 ? 0 : lv === 2 ? 2 : lv === 3 ? 3 : 4;
  for (let i = 0; i < spouts; i++) {
    const a = (i / spouts) * Math.PI * 2;
    const sp = cyl(0.04, 0.06, 0.16, 6, 0x46562f, Math.cos(a) * 0.17, 0.16, Math.sin(a) * 0.17);
    sp.rotation.z = Math.cos(a) * 1.1; sp.rotation.x = -Math.sin(a) * 1.1; flatify(sp); head.add(sp);
  }
}
// a forward jet of rounded flame puffs from origin ox, fanning at angle ang
function flameJet(head: THREE.Group, ox: number, ang: number, reach: number, puffs: number, col: number) {
  for (let i = 0; i < puffs; i++) {
    const t = i / Math.max(1, puffs - 1);
    const r = 0.17 - t * 0.08;
    const fz = 0.05 + t * reach;
    const fx = ox + Math.sin(ang) * t * reach * 0.7;
    const fy = 0.06 + Math.sin(t * Math.PI) * 0.1;
    const warm = t > 0.5;
    const fb = ball(r, warm ? 0xffd27a : col, fx, fy, fz, 1); fb.castShadow = false;
    emis(fb, warm ? 0xffd27a : col, 1.7); head.add(fb);
  }
}
// FIRE — 1 jet → twin → triple fan → roaring inferno (form changes each level)
function flameHead(head: THREE.Group, lv: number, col: number) {
  const noz = cyl(0.13 + lv * 0.015, 0.17 + lv * 0.015, 0.16 + lv * 0.03, 8, 0x23241f, 0, 0.04, -0.04); noz.rotation.x = Math.PI / 2; flatify(noz); head.add(noz);
  if (lv === 1) flameJet(head, 0, 0, 0.34, 4, col);
  else if (lv === 2) { flameJet(head, -0.1, -0.28, 0.4, 5, col); flameJet(head, 0.1, 0.28, 0.4, 5, col); }
  else if (lv === 3) { flameJet(head, -0.12, -0.5, 0.42, 5, col); flameJet(head, 0, 0, 0.52, 6, col); flameJet(head, 0.12, 0.5, 0.42, 5, col); }
  else {
    flameJet(head, -0.14, -0.55, 0.46, 6, col); flameJet(head, 0, 0, 0.62, 7, col); flameJet(head, 0.14, 0.55, 0.46, 6, col);
    const core = ball(0.17, 0xffffff, 0, 0.16, 0.12, 1); core.castShadow = false; emis(core, 0xfff0d0, 2.6); head.add(core);
    for (let i = 0; i < 3; i++) { const e = ball(0.05, 0xffd27a, (i - 1) * 0.2, 0.5 + i * 0.05, 0.18, 0); e.castShadow = false; emis(e, 0xffb45a, 1.9); head.add(e); }
  }
}
// FROST — single lance → +2 shards → 4 shards + back spire → spire forest + ring + core
function crystalHead(head: THREE.Group, lv: number, col: number) {
  const lance = cone(0.12 + lv * 0.016, 0.44 + lv * 0.1, 4, col, 0, 0.12, 0);
  lance.rotation.x = Math.PI / 2; lance.rotation.z = 0.4; lance.position.z = 0.28 + lv * 0.04; emis(lance, col, 1.5); head.add(lance);
  if (lv === 1) { crystalSpike(head, 0.07, 0.2, 0, 0.06, -0.12, col); }
  else if (lv === 2) { crystalSpike(head, 0.08, 0.26, -0.15, 0.08, -0.06, col, -0.6); crystalSpike(head, 0.08, 0.26, 0.15, 0.08, -0.06, col, 0.6); }
  else if (lv === 3) {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; crystalSpike(head, 0.08, 0.28, Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17 - 0.02, col, a); }
    crystalSpike(head, 0.1, 0.42, 0, 0.1, -0.18, col);
  } else {
    crystalSpike(head, 0.11, 0.54, 0, 0.1, -0.2, col);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; crystalSpike(head, 0.08, 0.28 + (i % 2) * 0.14, Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2 - 0.04, col, a); }
    const ring = cyl(0.27, 0.27, 0.04, 12, col, 0, 0.04, 0); ring.rotation.x = Math.PI / 2; ring.position.z = 0.08; emis(ring, col, 0.8); head.add(ring);
    const core = ball(0.1, 0xffffff, 0, 0.13, 0.0, 1); core.castShadow = false; emis(core, col, 2.2); head.add(core);
  }
}
// MORTAR — 1 barrel → +magazine → twin barrels + armour → triple battery + drum
function mortarHead(head: THREE.Group, lv: number, col: number) {
  const breech = box(0.32 + lv * 0.02, 0.2 + lv * 0.015, 0.3, 0x3a3d36, 0, 0.06, -0.04); flatify(breech); head.add(breech);
  const barrels = lv <= 1 ? 1 : lv === 2 ? 1 : lv === 3 ? 2 : 3;
  const len = 0.34 + lv * 0.06;
  for (let i = 0; i < barrels; i++) {
    const bx = (i - (barrels - 1) / 2) * 0.16;
    const bar = cyl(0.1 + (lv >= 2 ? 0.015 : 0), 0.13, len, 10, 0x23241f, bx, 0.12 + len * 0.2, len * 0.3); bar.rotation.x = -0.7; flatify(bar); head.add(bar);
    const ember = ball(0.07, col, bx, 0.12 + len * 0.38, len * 0.56, 1); ember.castShadow = false; emis(ember, col, 1.7); head.add(ember);
  }
  if (lv === 2) { const mag = box(0.15, 0.17, 0.22, 0x2a2c29, 0.25, 0.08, -0.06); flatify(mag); head.add(mag); }
  if (lv >= 3) for (const sx of [-1, 1]) { const plate = box(0.06, 0.24, 0.3, 0x4a4d45, sx * 0.27, 0.08, 0); flatify(plate); head.add(plate); }
  if (lv >= 4) { const drum = cyl(0.13, 0.13, 0.2, 10, 0x2a2c29, 0, 0.06, -0.18); drum.rotation.x = Math.PI / 2; flatify(drum); head.add(drum); const ring2 = cyl(0.46, 0.46, 0.06, 12, 0x4a4d45, 0, -0.04, 0); flatify(ring2); head.add(ring2); }
}
// gold up-chevron + the SOULS COST to upgrade, shown floating over a tower.
// (so the player always knows how much the next upgrade costs — never a mystery)
function makeUpArrow(): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.92, 0.69, 1);
  (s as any).__cv = cv; (s as any).__tex = tex;
  return s;
}
// keep big upgrade costs short so they never overflow their pill (e.g. 12480 → "12k")
function fmtCost(n: number): string { return n >= 10000 ? Math.round(n / 1000) + 'k' : String(n); }
function drawUpArrow(s: THREE.Sprite, cost: number, color: number) {
  const cv = (s as any).__cv as HTMLCanvasElement | undefined; if (!cv) return;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 96);
  // chevron (top)
  ctx.beginPath(); ctx.moveTo(64, 6); ctx.lineTo(86, 34); ctx.lineTo(74, 34); ctx.lineTo(74, 46); ctx.lineTo(54, 46); ctx.lineTo(54, 34); ctx.lineTo(42, 34); ctx.closePath();
  ctx.fillStyle = '#ffd270'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,16,8,.8)'; ctx.stroke();
  // cost chip (bottom): a dark pill with the souls number in the tower's colour
  const hex = '#' + color.toString(16).padStart(6, '0');
  const label = fmtCost(cost);
  ctx.font = '800 34px Archivo, system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  const pillW = tw + 40, pillX = 64 - pillW / 2, pillY = 54, pillH = 38, r = 19;
  ctx.beginPath();
  ctx.moveTo(pillX + r, pillY); ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r); ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
  ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r); ctx.closePath();
  ctx.fillStyle = 'rgba(12,16,22,.86)'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = hex; ctx.stroke();
  // tiny skull dot (souls glyph) + number
  ctx.fillStyle = hex; ctx.beginPath(); ctx.arc(pillX + 16, pillY + pillH / 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, pillX + 28, pillY + pillH / 2 + 1);
  (s as any).__tex.needsUpdate = true;
}
// a short-lived floating label that rises + fades (used to flash an upgrade cost
// the player can't yet afford, so the price is never a mystery)
function floatCost(fx: THREE.Group, x: number, z: number, text: string, color: number) {
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 56;
  const ctx = cv.getContext('2d')!;
  const hex = '#' + color.toString(16).padStart(6, '0');
  ctx.font = '800 36px Archivo, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.72)'; ctx.strokeText(text, 80, 28);
  ctx.fillStyle = hex; ctx.fillText(text, 80, 28);
  const tex = new THREE.CanvasTexture(cv);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.3, 0.46, 1); s.position.set(x, 1.7, z);
  fx.add(s);
  const start = performance.now();
  function step() {
    const e = (performance.now() - start) / 850;
    if (e >= 1) { fx.remove(s); tex.dispose(); (s.material as THREE.SpriteMaterial).dispose(); return; }
    s.position.y = 1.7 + e * 0.95;
    (s.material as THREE.SpriteMaterial).opacity = 1 - e * e;
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function punch(g: THREE.Object3D) {
  const start = performance.now();
  function step() {
    const e = (performance.now() - start) / 240;
    if (e >= 1) { g.scale.setScalar(1); return; }
    g.scale.setScalar(1 + Math.sin(e * Math.PI) * 0.38);
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
// a level badge over the tower. Since upgrading is endless, a fixed row of dots
// would lie (implies a 4-cap) — so we just show the actual level number "LV n".
function makePips(): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 44;
  const tex = new THREE.CanvasTexture(cv);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.6, 0.206, 1);
  (s as any).__cv = cv; (s as any).__tex = tex;
  return s;
}
function drawPips(s: THREE.Sprite, level: number, color: number) {
  const cv = (s as any).__cv as HTMLCanvasElement; const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 44);
  const hex = '#' + color.toString(16).padStart(6, '0');
  const label = 'LV ' + level;
  ctx.font = '800 26px Archivo, system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  const pillW = tw + 26, pillX = 64 - pillW / 2, pillY = 8, pillH = 28, r = 14;
  ctx.beginPath();
  ctx.moveTo(pillX + r, pillY); ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r); ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
  ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r); ctx.closePath();
  ctx.fillStyle = 'rgba(12,16,22,.82)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = hex; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = hex; ctx.fillText(label, 64, pillY + pillH / 2 + 1);
  (s as any).__tex.needsUpdate = true;
}
function applyTowerLevel(tw: Tower) {
  const T = TOWER_TYPES[tw.type];
  const L = tw.level - 1;
  // damage keeps climbing forever (the reason to keep spending); range + fire-rate
  // growth CAP so no single deep tower covers the whole map or fires absurdly fast.
  tw.range = T.range + Math.min(5, L) * 0.26;
  tw.dmg = Math.round(T.dmg * (1 + L * 0.5));
  tw.rate = T.rate * (1 + Math.min(6, L) * 0.16);
  // STORM arcs to +1 enemy every 2 levels; VENOM poison ticks harder each level
  tw.chain = T.chain ? T.chain + Math.floor(L / 2) : 0;
  tw.chainR = T.chainR || 0;
  tw.dot = T.dot ? Math.round(T.dot * (1 + L * 0.5)) : 0;
  tw.dotTime = T.dotTime || 0;
  rebuildHead(tw); // shape grows/changes with level
  if (tw.light) { const li = Math.min(8, tw.level); tw.light.intensity = 5 + li * 1.6; tw.light.distance = 3 + li * 0.4; }
  tw.ring.geometry.dispose();
  tw.ring.geometry = new THREE.RingGeometry(tw.range - 0.06, tw.range, 40);
  drawPips(tw.pips, tw.level, tw.color);
  drawUpArrow(tw.upArrow, UPGRADE_COST(tw.level), tw.color); // keep the shown cost in sync
}
function upgradeTower(tw: Tower) {
  tw.level = Math.min(TOWER_MAX_LVL, tw.level + 1);
  applyTowerLevel(tw);
}

// ─── enemies ────────────────────────────────────────────────────────────────
function spawnEnemy(root: THREE.Group, st: any, def: IntruderDef) {
  const g = def.make();
  const s = ENEMY_SCALE * def.scale;
  g.scale.setScalar(s);
  flatify(g);
  const laneOff = (Math.random() - 0.5) * (LANE_HALF * 1.5);
  const p = posAlong(0);
  const x = p.x + p.px * laneOff, z = p.z + p.pz * laneOff;
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(p.dx, p.dz); // face along the path
  root.add(g);
  const hpBar = makeHpBar();
  if (def.boss) hpBar.scale.set(1.9, 0.26, 1); // bigger bar for bosses
  drawHpBar(hpBar, 1);
  st.fxLayer.add(hpBar);
  // gentle early ramp, then a steep quadratic + small cubic tail so the MID-LATE
  // nights really bite (the cubic term is ~0 early, dominant by night 12+).
  const w = st.wave;
  const hpScaled = Math.round(def.hp * (1 + w * 0.16 + w * w * 0.024 + w * w * w * 0.0007));
  const speedK = 1 + Math.min(0.95, st.wave * 0.042); // the dead get quicker each night
  const en: Enemy = {
    g, def, dist: 0, x, z, laneOff,
    hp: hpScaled, maxHp: hpScaled, spd: def.spd * speedK, phase: Math.random() * 6,
    dead: false, reached: false, slow: 0, poison: 0, poisonDps: 0, poisonT: 0, hpBar,
    dying: 0, vy: 0, spin: 0, dustT: Math.random() * 0.3,
    hitFlash: 0, hitStop: 0, flashOn: false,
  };
  st.enemies.push(en);
}
function killEnemy(st: any, en: Enemy, _root: THREE.Group) {
  en.dead = true;
  // launch + burst (Block Party feel): corpse flies, bone + ectoplasm bits spray
  en.dying = 0.5; en.vy = 4.5 + Math.random() * 3; en.spin = (Math.random() - 0.5) * 18;
  if (en.hpBar) { st.fxLayer.remove(en.hpBar); en.hpBar = null; }
  deathBurst(st.fxLayer, en.x, en.z); // matte chunks, no glow ring
  st.cash += en.def.bounty;
  st.score += 1;
  sfx.splat();
  if (Math.random() < 0.5) sfx.coin();
  pushHud(st);
}

// ─── projectiles + fx ───────────────────────────────────────────────────────
// a quick bright muzzle flash that pops + fades at (x,y,z)
function muzzleFlash(fx: THREE.Group, x: number, y: number, z: number, color: number) {
  const m = ball(0.2, color, x, y, z, 1); const mm = m.material as THREE.MeshStandardMaterial;
  mm.emissive = new THREE.Color(color); mm.emissiveIntensity = 2.4; mm.transparent = true; m.castShadow = false;
  fx.add(m);
  const start = performance.now();
  function step() {
    const e = (performance.now() - start) / 130;
    if (e >= 1) { fx.remove(m); m.geometry.dispose(); mm.dispose(); return; }
    m.scale.setScalar(0.5 + e * 1.4); mm.opacity = 1 - e;
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function fireWater(fx: THREE.Group, st: any, tw: Tower, target: Enemy) {
  const col = tw.color;
  const kind = TOWER_TYPES[tw.type].head;
  // spawn from the barrel muzzle (forward of the swivelled head)
  const fxd = Math.sin(tw.yaw), fzd = Math.cos(tw.yaw);
  const mx = tw.x + fxd * 0.5, mz = tw.z + fzd * 0.5, my = 1.05;
  if (kind === 'coil') { stormStrike(fx, st, tw, target); return; } // instant chain lightning, no projectile
  muzzleFlash(fx, mx, my, mz, col);
  const base = { target, dmg: tw.dmg, slow: tw.slow, splash: tw.splash, chill: tw.chillR, color: col,
    dot: tw.dot, dotTime: tw.dotTime,
    tx: target.x, ty: 0.5, tz: target.z, x: mx, y: my, z: mz };
  if (tw.splash > 0) {
    // MORTAR — a lobbed shell arcing onto the target's ground spot, then it bursts
    const g = ball(0.2, col, mx, my, mz, 1); emis(g, col, 1.5); fx.add(g);
    const ex = target.x, ez = target.z;
    const dist = Math.hypot(ex - mx, ez - mz);
    st.projs.push({ ...base, g, arc: true, t: 0, flight: Math.max(0.4, dist / 6.5),
      sx: mx, sy: my, sz: mz, ex, ey: 0.35, ez, arcH: 1.1 + dist * 0.22 });
  } else {
    // FIRE = round fireball; FROST = elongated icy shard (both home in fast)
    const shard = TOWER_TYPES[tw.type].head === 'crystal';
    const g = ball(shard ? 0.1 : 0.15, col, mx, my, mz, shard ? 0 : 1);
    if (shard) g.scale.set(0.6, 0.6, 2.4);
    emis(g, col, 1.6); fx.add(g);
    st.projs.push({ ...base, g, arc: false, t: 0, flight: 0, sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0, arcH: 0 });
  }
}
// STORM — an INSTANT chain of lightning: zap the target, then leap to the nearest
// not-yet-hit enemy within reach, repeating for `chain` extra links (each weaker).
// Great against the dense packs the late nights throw at you.
function stormStrike(fx: THREE.Group, st: any, tw: Tower, target: Enemy) {
  let px = tw.x + Math.sin(tw.yaw) * 0.4, pz = tw.z + Math.cos(tw.yaw) * 0.4, py = 1.25;
  const hit = new Set<Enemy>();
  let cur: Enemy | null = target;
  let dmg = tw.dmg;
  const links = 1 + (tw.chain || 0);
  for (let i = 0; i < links && cur; i++) {
    lightningBolt(fx, px, py, pz, cur.x, 0.7, cur.z, tw.color);
    cur.hp -= dmg; hitReact(cur, dmg);
    if (cur.hpBar) drawHpBar(cur.hpBar, cur.hp / cur.maxHp);
    splash(fx, cur.x, 0.6, cur.z, tw.color);
    hit.add(cur);
    if (cur.hp <= 0) killEnemy(st, cur, fx);
    px = cur.x; pz = cur.z; py = 0.7;
    dmg *= 0.72; // each successive arc hits softer
    // next link = nearest live, un-hit enemy within chain reach
    let nxt: Enemy | null = null, nd = (tw.chainR || 2) * (tw.chainR || 2);
    for (const e of st.enemies) {
      if (e.dead || hit.has(e)) continue;
      const dx = e.x - px, dz = e.z - pz, d2 = dx * dx + dz * dz;
      if (d2 <= nd) { nd = d2; nxt = e; }
    }
    cur = nxt;
  }
}
// a brief jagged bolt of glowing segments between two points (own materials so the
// fade can't pollute the shared prim-material cache)
function lightningBolt(fx: THREE.Group, ax: number, ay: number, az: number, bx: number, by: number, bz: number, col: number) {
  const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false });
  const g = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  const seg = 5; let px = ax, py = ay, pz = az;
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const jx = i < seg ? (Math.random() - 0.5) * 0.36 : 0, jz = i < seg ? (Math.random() - 0.5) * 0.36 : 0;
    const nx = ax + (bx - ax) * t + jx, ny = ay + (by - ay) * t, nz = az + (bz - az) * t + jz;
    const dx = nx - px, dy = ny - py, dz = nz - pz, len = Math.hypot(dx, dy, dz) || 1e-3;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 4), mat);
    m.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
    m.quaternion.setFromUnitVectors(up, new THREE.Vector3(dx / len, dy / len, dz / len));
    m.castShadow = false; g.add(m);
    px = nx; py = ny; pz = nz;
  }
  fx.add(g);
  const start = performance.now();
  (function step() {
    const e = (performance.now() - start) / 170;
    if (e >= 1) { fx.remove(g); g.traverse((o) => { const ge = (o as THREE.Mesh).geometry; if (ge) ge.dispose(); }); mat.dispose(); return; }
    mat.opacity = 0.95 * (1 - e);
    requestAnimationFrame(step);
  })();
}

interface Particle { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; life0: number; grav: number; grow: number; o0: number; }
const PARTICLES: Particle[] = [];
// enemy flinch on hit — staggers ONLY if the hit is big relative to the enemy's
// max HP (a poise threshold). So bosses / heavy undead shrug off chip damage and
// keep marching (their big HP pool actually matters); only a hefty hit (e.g. an
// upgraded mortar shell) nudges them back.
function hitReact(en: Enemy, dmg: number) {
  const frac = dmg / Math.max(1, en.maxHp);
  if (frac < 0.05) return;                                 // below this enemy's threshold → no stagger
  en.hitStop = Math.min(0.07, frac * 0.5);                 // brief stutter, scaled to the hit
  en.dist = Math.max(0, en.dist - Math.min(0.18, frac * 0.5)); // knockback, scaled + capped
}
function setEmissiveAll(g: THREE.Object3D, f: number) {
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && m.emissive) m.emissive.setScalar(f);
  });
}
// area blast — damage + slow every live enemy within radius of the impact
function splashHit(st: any, root: THREE.Group, x: number, z: number, radius: number, dmg: number, slow: number) {
  for (const en of st.enemies) {
    if (en.dead) continue;
    const dx = en.x - x, dz = en.z - z;
    if (dx * dx + dz * dz <= radius * radius) {
      en.hp -= dmg; en.slow = Math.max(en.slow, slow); hitReact(en, dmg);
      if (en.hpBar) drawHpBar(en.hpBar, en.hp / en.maxHp);
      if (en.hp <= 0) killEnemy(st, en, root);
    }
  }
}
// Block-Party-style death burst — MATTE physical chunks (no glow, so it reads as
// shattering bone/gore, clearly different from the glowing weapon fx)
function deathBurst(fx: THREE.Group, x: number, z: number) {
  for (let i = 0; i < 18; i++) {
    const k = Math.random();
    const col = k < 0.4 ? 0xe6e1cd : k < 0.7 ? 0x6b6256 : 0x46402f; // bone / grey rot / dark earth
    const r = 0.055 + Math.random() * 0.06;
    const m = ball(r, col, x, 0.8 + Math.random() * 0.5, z); // no emissive → matte
    m.castShadow = false; fx.add(m);
    const ang = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 5;
    PARTICLES.push({ m, vx: Math.sin(ang) * sp, vy: 3.6 + Math.random() * 4, vz: Math.cos(ang) * sp, life: 0.55 + Math.random() * 0.5, life0: 1, grav: 9, grow: 0, o0: 1 });
  }
}
// small grey foot-dust puffs (kicked up as characters walk) — like the store
function footDust(fx: THREE.Group, x: number, z: number) {
  for (let i = 0; i < 3; i++) {
    const r = 0.1 + Math.random() * 0.06;
    const m = ball(r, 0xcabfa6, x + (Math.random() - 0.5) * 0.26, 0.07, z + (Math.random() - 0.5) * 0.26); // pale dust, pops on the dark ground
    const mm = m.material as THREE.MeshStandardMaterial;
    mm.transparent = true; mm.opacity = 0.62; m.castShadow = false; m.receiveShadow = false; fx.add(m);
    const life = 0.5 + Math.random() * 0.25;
    PARTICLES.push({ m, vx: (Math.random() - 0.5) * 0.45, vy: 0.35 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.45, life, life0: life, grav: 1.6, grow: 2.6, o0: 0.62 });
  }
}
// pop a freshly-placed tower in from nothing (tactile "slam")
function popIn(g: THREE.Object3D) {
  const start = performance.now();
  function step() {
    const e = (performance.now() - start) / 260;
    if (e >= 1) { g.scale.setScalar(1); return; }
    const s = e < 0.7 ? (0.2 + (e / 0.7) * 0.95) : (1.15 - ((e - 0.7) / 0.3) * 0.15); // overshoot then settle
    g.scale.setScalar(s);
    requestAnimationFrame(step);
  }
  g.scale.setScalar(0.2);
  requestAnimationFrame(step);
}
function splash(fx: THREE.Group, x: number, y: number, z: number, color = 0x8fe6b8) {
  for (let i = 0; i < 6; i++) {
    const m = ball(0.06, color, x, y, z);
    (m.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(color);
    m.castShadow = false;
    fx.add(m);
    PARTICLES.push({
      m, vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 2,
      life: 0.4 + Math.random() * 0.2, life0: 1, grav: 9, grow: 0, o0: 1,
    });
  }
}
function renderFx(fx: THREE.Group, dt: number) {
  for (let i = PARTICLES.length - 1; i >= 0; i--) {
    const p = PARTICLES[i];
    p.life -= dt;
    p.vy -= p.grav * dt;
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    if (p.grow) p.m.scale.multiplyScalar(1 + p.grow * dt);              // dust expands
    const mat = p.m.material as THREE.MeshStandardMaterial;
    if (mat.transparent) mat.opacity = Math.max(0, p.life / p.life0) * p.o0; // and fades out
    if (p.life <= 0 || p.m.position.y < -0.05) {
      fx.remove(p.m); disposeGroup(p.m); PARTICLES.splice(i, 1);
    }
  }
}
function ringPulse(fx: THREE.Group, x: number, z: number, color = 0xffd23f) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.34, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.1, z);
  fx.add(ring);
  const start = performance.now();
  function grow() {
    const e = (performance.now() - start) / 450;
    if (e >= 1) { fx.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); return; }
    ring.scale.setScalar(1 + e * 2.5);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - e);
    requestAnimationFrame(grow);
  }
  requestAnimationFrame(grow);
}
function bounce(g: THREE.Object3D) {
  // Re-entrancy guard: WITHOUT it, spam-tapping (e.g. a tower you can't afford to
  // upgrade) restarts the bounce from the already-raised y each time, so the
  // object ratchets up and floats into the air permanently. Ignore overlaps.
  const o = g as any;
  if (o.__bouncing) return;
  o.__bouncing = true;
  const start = performance.now(); const y0 = g.position.y;
  function b() {
    const e = (performance.now() - start) / 250;
    if (e >= 1) { g.position.y = y0; o.__bouncing = false; return; }
    g.position.y = y0 + Math.sin(e * Math.PI) * 0.12;
    requestAnimationFrame(b);
  }
  requestAnimationFrame(b);
}

// ─── wave director + hud ────────────────────────────────────────────────────
function startWave(st: any, onWave: (w: number) => void) {
  st.wave += 1;
  st.betweenWaves = false;
  const pool = poolForWave(st.wave);
  const count = 6 + Math.round(st.wave * 3.3);              // more dead each night
  st.spawnGap = Math.max(0.22, 1.0 - st.wave * 0.092);      // and they pour in denser (tighter late floor)
  st.spawnQ = [];
  for (let i = 0; i < count; i++) {
    const def = pool[Math.floor(Math.random() * pool.length)];
    st.spawnQ.push(def);
  }
  // A boss leads EVERY THIRD night now (3,6,9,12 …) so there's a real threat
  // early and often. Milestone nights (every 6th) are led by an apex boss; the
  // others by ELITES — random oversized champions pulled from the whole cast.
  const isBoss = st.wave % 3 === 0;
  if (isBoss) {
    const bossCount = 1 + Math.floor(st.wave / 9);          // 1 → 2 by night 9 → 3 by 18 …
    for (let b = 0; b < bossCount; b++) {
      if (st.wave % 6 === 0 && b === 0) {
        st.spawnQ.unshift(BOSSES[(st.wave / 6 - 1) % BOSSES.length]); // apex horror leads the milestone
      } else {
        const base = pool[Math.floor(Math.random() * pool.length)];
        st.spawnQ.unshift(eliteFrom(base));                 // any cast member, scaled-up + buffed
      }
    }
  }
  // open any new build-plots whose night has arrived — a juicy reveal so the
  // player sees fresh ground unlock (more room to expand late game)
  for (const p of st.plots) {
    if (!p.live && st.wave >= p.unlock) {
      p.live = true;
      popIn(p.marker);
      ringPulse(st.fxLayer, p.x, p.z, 0x79e0ad);
      sfx.plant();
    }
  }
  st.spawnT = 0.3;
  sfx.wave();
  onWave(st.wave, isBoss);
  pushHud(st);
}
function pushHud(st: any) {
  const last = st.lastHud;
  const towers = st.towers.length;
  if (last.lives !== st.lives || last.cash !== st.cash || last.score !== st.score || last.wave !== st.wave || last.towers !== towers) {
    st.lastHud = { lives: st.lives, cash: st.cash, score: st.score, wave: st.wave, towers };
    st.onHud?.(st.lastHud);
  }
}
function endGame(st: any, onGameOver: (s: number) => void) {
  st.over = true;
  sfx.over();
  onGameOver(st.score);
}
function resetGame(root: THREE.Group, fx: THREE.Group, st: any, onHud: (h: HudState) => void) {
  for (const en of st.enemies) { if (en.hpBar) fx.remove(en.hpBar); root.remove(en.g); disposeGroup(en.g); }
  for (const tw of st.towers) { root.remove(tw.g); disposeGroup(tw.g); }
  for (const pr of st.projs) { fx.remove(pr.g); disposeGroup(pr.g); }
  st.enemies = []; st.towers = []; st.projs = [];
  for (const p of st.plots) { p.tower = null; p.marker.visible = true; p.live = p.unlock <= 0; }
  st.lives = START_LIVES; st.cash = START_CASH; st.score = 0; st.wave = 0;
  st.spawnQ = []; st.betweenWaves = true; st.waveBreak = 3.5; st.over = false; // longer first breather to place a tower
  st.demoReady = false; st.attractT = 0;
  st.lastHud = { lives: -1, cash: -1, score: -1, wave: -1, towers: -1 };
  st.onHud = onHud;
  pushHud(st);
}
function angDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ─── golden-hour gradient sky dome (BackSide shader sphere) ──────────────────
function makeSkyDome(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 14),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x12161f) },   // lifted navy crown (off near-black → no mobile banding)
        mid: { value: new THREE.Color(0x1d2738) },   // deep night blue
        bot: { value: new THREE.Color(0x2d3736) },   // murky grey-green horizon mist
        glow: { value: new THREE.Color(0x8ea2c2) },  // pale cold moon glow
        glowDir: { value: new THREE.Vector3(0.25, 0.42, -0.8).normalize() },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 glow; uniform vec3 glowDir; void main(){ vec3 n = normalize(vP); float h = n.y; vec3 c = h > 0.0 ? mix(mid, top, clamp(h*1.2,0.0,1.0)) : mix(mid, bot, clamp(-h*1.7,0.0,1.0)); float g = clamp(dot(n, glowDir), 0.0, 1.0); c = mix(c, glow, g*g*0.6); gl_FragColor = vec4(c,1.0); }',
    }),
  );
}

// ─── drifting spectral wisps / graveyard mist motes ──────────────────────────
function makeMotes(): THREE.Points {
  const N = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 6.5;
    pos[i * 3 + 1] = Math.random() * 3.2 + 0.15;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 7.5 - 1;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xa6c6b2, size: 0.16, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
  }));
}

// ─── low-lying ground fog: soft translucent planes drifting over the graves ──
function makeGroundMist(): THREE.Group {
  const g = new THREE.Group();
  const tex = mistTexture();
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.1, depthWrite: false,
        color: 0x9fb0ad, blending: THREE.NormalBlending, fog: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set((Math.random() * 2 - 1) * 4, 0.25 + Math.random() * 0.5, (Math.random() * 2 - 1) * 6 - 1);
    m.rotation.z = Math.random() * Math.PI;
    (m as any).__sp = 0.12 + Math.random() * 0.16;
    (m as any).__dir = Math.random() < 0.5 ? 1 : -1;
    g.add(m);
  }
  return g;
}
let _mistTex: THREE.CanvasTexture | null = null;
function mistTexture(): THREE.CanvasTexture {
  if (_mistTex) return _mistTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
  _mistTex = new THREE.CanvasTexture(c);
  return _mistTex;
}

// ─── lights — golden-hour suburb: cool sky fill + warm key (shadows) + cool rim ─
function Lights() {
  const keyRef = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const k = keyRef.current; if (!k) return;
    k.shadow.mapSize.set(2048, 2048);
    k.shadow.camera.near = 1; k.shadow.camera.far = 60;
    k.shadow.camera.left = -10; k.shadow.camera.right = 10;
    k.shadow.camera.top = 12; k.shadow.camera.bottom = -12;
    k.shadow.bias = -0.0005;
    k.shadow.normalBias = 0.02;
    k.target.position.set(0, 0, -1);
    k.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <hemisphereLight args={[0x52638a, 0x161a14, 0.66]} />
      <ambientLight intensity={0.2} />
      {/* cold moonlight key (casts the long graveyard shadows) */}
      <directionalLight
        ref={keyRef}
        position={[5, 14, -7]}
        intensity={1.15}
        color={0xb6c6ea}
        castShadow
      />
      {/* faint sickly-green fill from the far mist */}
      <directionalLight position={[-7, 4, 6]} intensity={0.2} color={0x6f9a86} />
    </>
  );
}

// ─── exported Canvas wrapper ────────────────────────────────────────────────
export default function Scene(props: Props) {
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      orthographic
      dpr={[1, 2]}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      camera={{ position: [9, 12, 13], zoom: 52, near: 0.1, far: 200 }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <Lights />
      <World {...props} />
      <EffectComposer>
        {/* no mipmapBlur — it produces rainbow chroma noise in dark areas on mobile
            half-float buffers. Higher threshold keeps the dark ground out of bloom. */}
        <Bloom intensity={0.7} luminanceThreshold={0.62} luminanceSmoothing={0.25} />
        <Vignette eskil={false} offset={0.2} darkness={0.62} />
      </EffectComposer>
    </Canvas>
  );
}
