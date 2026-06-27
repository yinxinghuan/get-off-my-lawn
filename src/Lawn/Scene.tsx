import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  P, box, cyl, cone, ball,
  fence, lamp, PLANTS,
  CHARACTERS, ARCHETYPES, MONSTERS, rigOf,
} from './lab';
import { sfx } from './audio';

// ─── Tuning ────────────────────────────────────────────────────────────────
const START_CASH = 175;
const START_LIVES = 5;
const TOWER_COST = 90;
const UPGRADE_COST = (lvl: number) => 70 + lvl * 55;
const TOWER_MAX_LVL = 4;
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
const PLOT_SPOTS: [number, number][] = (() => {
  const spots: [number, number][] = [];
  for (const gz of GAP_Z) for (const x of [-2.1, 0, 2.1]) spots.push([x, gz]);
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

// ─── Entity types ───────────────────────────────────────────────────────────
interface Enemy {
  g: THREE.Group; def: IntruderDef;
  dist: number;            // distance travelled along the winding path
  x: number; z: number;    // current world position (path + perp offset)
  laneOff: number;         // perpendicular offset on the path
  hp: number; maxHp: number; spd: number;
  phase: number; dead: boolean; reached: boolean;
  slow: number; // remaining slow timer (sec)
  hpBar: THREE.Sprite | null;
  dying: number; vy: number; spin: number; dustT: number; // death-launch anim + foot dust
  hitFlash: number; hitStop: number; flashOn: boolean;     // damage flinch (flash + brief freeze)
}
interface Tower {
  g: THREE.Group; head: THREE.Group; ring: THREE.Mesh; pips: THREE.Sprite; upArrow: THREE.Sprite;
  type: number; color: number; x: number; z: number; level: number;
  range: number; dmg: number; rate: number; slow: number; splash: number; cd: number; yaw: number;
  light?: THREE.PointLight; flicker: number;
}
interface Plot { x: number; z: number; disc: THREE.Mesh; marker: THREE.Group; ring: THREE.Mesh; ghost: THREE.Group; tower: Tower | null; }
interface Proj { g: THREE.Mesh; x: number; y: number; z: number; tx: number; ty: number; tz: number; target: Enemy; dmg: number; slow: number; splash: number; color: number; }

export interface HudState { lives: number; cash: number; score: number; wave: number; towers: number; }
export interface SceneHandle { restart: () => void; }

type Mode = 'attract' | 'play' | 'over';
interface Props {
  mode: Mode;
  selectedType: number;
  onHud: (h: HudState) => void;
  onWave: (w: number) => void;
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
// tint a character toward ashen corpse pallor (the freshly dead)
const PALLOR = new THREE.Color(0x97a6a4);
function paleDead(g: THREE.Group): THREE.Group {
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && m.color) {
      m.color.lerp(PALLOR, 0.42);
      if ('emissive' in m) { m.emissive = new THREE.Color(0x223033); (m as any).emissiveIntensity = 0.25; }
    }
  });
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
        } else { bounce(tw.g); sfx.splat(); }
      }
    }
    function onDown(e: PointerEvent) { pd = { x: e.clientX, y: e.clientY, moved: false }; }
    function onMove(e: PointerEvent) {
      if (!pd) return;
      const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
      if (!pd.moved && Math.hypot(dx, dy) > 8) pd.moved = true;
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
      const aff = st.cash >= TOWER_TYPES[st.selectedType].cost;
      p.marker.visible = true;
      const rm = p.ring.material as THREE.MeshBasicMaterial;
      if (aff) {
        const pulse = 0.6 + Math.sin(st.time * 3.2 + p.x) * 0.28;
        rm.color.setHex(0x7fe6b4); rm.opacity = pulse;
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
      // damage flinch — white flash + brief freeze (hit-stop)
      if (en.hitFlash > 0) {
        en.hitFlash -= dt;
        setEmissiveAll(en.g, Math.max(0, en.hitFlash / 0.15) * 0.9);
        en.flashOn = true;
      } else if (en.flashOn) { setEmissiveAll(en.g, 0); en.flashOn = false; }
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
      if (en.def.legs) { en.dustT -= dt; if (en.dustT <= 0) { footDust(fx, en.x, en.z); en.dustT = 0.3; } }
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
      const canUp = !isAttract && tw.level < TOWER_MAX_LVL && st.cash >= UPGRADE_COST(tw.level);
      tw.upArrow.visible = canUp;
      if (canUp) {
        tw.upArrow.position.y = 2.0 + Math.sin(st.time * 4 + tw.x) * 0.09;
        const sc = 0.5 * (1 + 0.14 * Math.sin(st.time * 6));
        tw.upArrow.scale.set(sc, sc, 1);
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
        tw.yaw += angDelta(tw.yaw, desired) * Math.min(1, dt * 12);
        tw.head.rotation.y = tw.yaw;
        if (tw.cd <= 0) {
          tw.cd = 1 / tw.rate;
          fireWater(fx, st, tw, best);
          sfx.squirt();
        }
      }
    }

    // ── projectiles ──
    for (const pr of st.projs) {
      const en = pr.target;
      if (!en.dead) { pr.tx = en.x; pr.tz = en.z; pr.ty = 0.5; }
      const dx = pr.tx - pr.x, dy = pr.ty - pr.y, dz = pr.tz - pr.z;
      const d = Math.hypot(dx, dy, dz);
      const step = 16 * dt;
      if (d <= step || en.dead) {
        // impact
        if (pr.splash > 0) {
          // mortar: area blast at the impact point (hits everyone nearby)
          splashHit(st, root, pr.x, pr.z, pr.splash, pr.dmg, pr.slow);
          ringPulse(fx, pr.x, pr.z, pr.color);
        } else if (!en.dead) {
          en.hp -= pr.dmg; en.slow = Math.max(en.slow, pr.slow); hitReact(en);
          if (en.hpBar) drawHpBar(en.hpBar, en.hp / en.maxHp);
          if (en.hp <= 0) killEnemy(st, en, root);
        }
        splash(fx, pr.x, 0.4, pr.z, pr.color);
        pr.x = 1e9; // mark for removal
      } else {
        pr.x += (dx / d) * step; pr.y += (dy / d) * step; pr.z += (dz / d) * step;
        pr.g.position.set(pr.x, pr.y, pr.z);
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
  for (const [x, z] of PLOT_SPOTS) {
    root.add(makePad(x, z));
    const plot = makePlot(x, z);
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

function makePlot(x: number, z: number): Plot {
  // transparent raycast disc (generous tap target). NOTE: must stay visible:true
  // — the raycaster skips objects with visible:false — so we render it fully
  // transparent instead.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.05, z);

  // build-socket marker: a glowing spectral ring on the pad + a floating ghost
  // brazier-flame preview (shown only when affordable → "a brazier goes here").
  const marker = new THREE.Group();
  marker.position.set(x, 0, z);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.52, 28),
    new THREE.MeshBasicMaterial({ color: 0x7fe6b4, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.22;
  marker.add(ring);

  const ghost = new THREE.Group();
  const beam = box(0.05, 0.62, 0.05, 0x7fe6b4, 0, 0.46, 0, { e: 0x4fc88c, ei: 0.5 });
  (beam.material as THREE.MeshStandardMaterial).transparent = true;
  (beam.material as THREE.MeshStandardMaterial).opacity = 0.5; beam.castShadow = false;
  ghost.add(beam);
  const orb = ball(0.17, 0x8ff0c4, 0, 0.84, 0, 1);
  const om = orb.material as THREE.MeshStandardMaterial;
  om.emissive = new THREE.Color(0x6fe0a8); om.emissiveIntensity = 1.1;
  om.transparent = true; om.opacity = 0.78; orb.castShadow = false;
  ghost.add(orb);
  marker.add(ghost);

  return { x, z, disc, marker, ring, ghost, tower: null };
}

// ─── towers ─────────────────────────────────────────────────────────────────
// ── Weapon types — three clear roles (the build tray shows these) ────────────
export interface TowerType {
  id: string; name: string; cost: number; color: number;
  range: number; dmg: number; rate: number; slow: number; splash: number;
  head: 'flame' | 'crystal' | 'mortar';
  blurb: string;
}
export const TOWER_TYPES: TowerType[] = [
  { id: 'brazier', name: 'Brazier', cost: 80, color: 0x6fe0a0, range: 2.8, dmg: 9, rate: 1.8, slow: 0.4, splash: 0, head: 'flame', blurb: 'Steady spectral fire' },
  { id: 'frost', name: 'Frost Lamp', cost: 110, color: 0x6fd6ec, range: 2.7, dmg: 4, rate: 1.5, slow: 1.9, splash: 0, head: 'crystal', blurb: 'Chills — slows the dead' },
  { id: 'mortar', name: 'Bone Mortar', cost: 160, color: 0xc79bf0, range: 3.1, dmg: 16, rate: 0.75, slow: 0.3, splash: 1.3, head: 'mortar', blurb: 'Heavy splash blast' },
];

function plantTower(root: THREE.Group, plot: Plot, typeIdx: number): Tower {
  const T = TOWER_TYPES[typeIdx];
  const g = new THREE.Group();
  g.position.set(plot.x, 0, plot.z);
  const base = cyl(0.46, 0.54, 0.22, 8, 0x474b46, 0, 0.11, 0); flatify(base); g.add(base);
  const post = cyl(0.12, 0.14, 0.5, 8, 0x2a2c29, 0, 0.46, 0); flatify(post); g.add(post);
  const bowl = cyl(0.3, 0.2, 0.2, 10, 0x33352f, 0, 0.78, 0); flatify(bowl); g.add(bowl);
  const head = new THREE.Group(); head.position.y = 0.9; g.add(head); // shape rebuilt per type+level
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
    range: T.range, dmg: T.dmg, rate: T.rate, slow: T.slow, splash: T.splash,
    color: T.color, cd: 0, yaw: 0, light, flicker: Math.random() * 6,
  };
  applyTowerLevel(tw);
  return tw;
}

function emis(m: THREE.Mesh, color: number, ei: number) {
  const mm = m.material as THREE.MeshStandardMaterial;
  mm.emissive = new THREE.Color(color); mm.emissiveIntensity = ei; m.castShadow = false;
}
// rebuild the head shape for the tower's type + level (so upgrades change the form)
function rebuildHead(tw: Tower) {
  const head = tw.head;
  for (const c of [...head.children]) { head.remove(c); disposeGroup(c); }
  const shape = TOWER_TYPES[tw.type].head, lv = tw.level, col = tw.color;
  if (shape === 'flame') {
    const tall = 0.4 + lv * 0.14;
    const main = cone(0.16 + lv * 0.02, tall, 8, col, 0, tall / 2, 0); head.add(main); emis(main, col, 1.6);
    for (let i = 0; i < lv - 1; i++) {
      const a = (i / Math.max(1, lv - 1)) * Math.PI * 2;
      const tc = cone(0.08, tall * 0.55, 6, col, Math.cos(a) * 0.17, tall * 0.32, Math.sin(a) * 0.17);
      head.add(tc); emis(tc, col, 1.4);
    }
    if (lv >= 4) { const crown = ball(0.1, 0xfff3d6, 0, tall + 0.04, 0, 1); head.add(crown); emis(crown, col, 1.9); }
  } else if (shape === 'crystal') {
    const s = 0.3 + lv * 0.07;
    diamond(head, s, 0, 0.32, 0, col);
    const shards = Math.min(lv - 1, 4);
    for (let i = 0; i < shards; i++) {
      const a = (i / shards) * Math.PI * 2;
      diamond(head, s * 0.5, Math.cos(a) * 0.2, 0.18, Math.sin(a) * 0.2, col);
    }
  } else { // mortar — chunky cannon barrels
    const block = box(0.36, 0.18, 0.36, 0x3a3d36, 0, 0.05, 0); flatify(block); head.add(block);
    const barrels = Math.min(lv, 3);
    const len = 0.34 + lv * 0.07;
    for (let i = 0; i < barrels; i++) {
      const bx = (i - (barrels - 1) / 2) * 0.14;
      const bar = cyl(0.1, 0.13, len, 10, 0x23241f, bx, 0.12 + len * 0.28, 0.05); bar.rotation.x = -0.55; flatify(bar); head.add(bar);
      const ember = ball(0.07, col, bx, 0.12 + len * 0.5, 0.05 + len * 0.32, 1); head.add(ember); emis(ember, col, 1.7);
    }
    if (lv >= 4) { const ring2 = cyl(0.42, 0.42, 0.06, 12, 0x4a4d45, 0, 0.02, 0); flatify(ring2); head.add(ring2); }
  }
}
// a faceted diamond crystal (up cone + down cone) at (x,y,z)
function diamond(head: THREE.Group, size: number, x: number, y: number, z: number, color: number) {
  const up = cone(size * 0.5, size * 0.7, 6, color, x, y + size * 0.32, z);
  const dn = cone(size * 0.5, size * 0.5, 6, color, x, y - size * 0.22, z); dn.rotation.x = Math.PI;
  head.add(up); head.add(dn); emis(up, color, 1.2); emis(dn, color, 1.2);
}
// gold up-chevron sprite shown over a tower when it can be upgraded
function makeUpArrow(): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 48; cv.height = 48;
  const ctx = cv.getContext('2d')!;
  ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(42, 30); ctx.lineTo(30, 30); ctx.lineTo(30, 42); ctx.lineTo(18, 42); ctx.lineTo(18, 30); ctx.lineTo(6, 30); ctx.closePath();
  ctx.fillStyle = '#ffd270'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,16,8,.7)'; ctx.stroke();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  s.scale.set(0.5, 0.5, 1);
  return s;
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
// three little pips that fill in as the tower levels up
function makePips(): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 24;
  const tex = new THREE.CanvasTexture(cv);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.7, 0.18, 1);
  (s as any).__cv = cv; (s as any).__tex = tex;
  return s;
}
function drawPips(s: THREE.Sprite, level: number, color: number) {
  const cv = (s as any).__cv as HTMLCanvasElement; const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, 96, 24);
  const hex = '#' + color.toString(16).padStart(6, '0');
  const max = TOWER_MAX_LVL;
  for (let i = 0; i < max; i++) {
    const cx = 12 + i * (72 / (max - 1 || 1));
    ctx.beginPath(); ctx.arc(cx, 12, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < level ? hex : 'rgba(255,255,255,0.18)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
  }
  (s as any).__tex.needsUpdate = true;
}
function applyTowerLevel(tw: Tower) {
  const T = TOWER_TYPES[tw.type];
  tw.range = T.range + (tw.level - 1) * 0.3;
  tw.dmg = Math.round(T.dmg * (1 + (tw.level - 1) * 0.55));
  tw.rate = T.rate * (1 + (tw.level - 1) * 0.18);
  rebuildHead(tw); // shape grows/changes with level
  if (tw.light) { tw.light.intensity = 5 + tw.level * 1.6; tw.light.distance = 3 + tw.level * 0.4; }
  tw.ring.geometry.dispose();
  tw.ring.geometry = new THREE.RingGeometry(tw.range - 0.06, tw.range, 40);
  drawPips(tw.pips, tw.level, tw.color);
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
  drawHpBar(hpBar, 1);
  st.fxLayer.add(hpBar);
  const hpScaled = Math.round(def.hp * (1 + st.wave * 0.12));
  const en: Enemy = {
    g, def, dist: 0, x, z, laneOff,
    hp: hpScaled, maxHp: hpScaled, spd: def.spd, phase: Math.random() * 6,
    dead: false, reached: false, slow: 0, hpBar,
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
  deathBurst(st.fxLayer, en.x, en.z, 0x8ff0c4);
  ringPulse(st.fxLayer, en.x, en.z, 0x8ff0c4);
  st.cash += en.def.bounty;
  st.score += 1;
  sfx.splat();
  if (Math.random() < 0.5) sfx.coin();
  pushHud(st);
}

// ─── projectiles + fx ───────────────────────────────────────────────────────
function fireWater(fx: THREE.Group, st: any, tw: Tower, target: Enemy) {
  const col = tw.color;
  const g = ball(tw.splash > 0 ? 0.2 : 0.14, col, 0, 0, 0, 1);
  const gm = g.material as THREE.MeshStandardMaterial;
  gm.emissive = new THREE.Color(col); gm.emissiveIntensity = 1.6;
  g.castShadow = false;
  g.position.set(tw.x, 1.0, tw.z);
  fx.add(g);
  st.projs.push({ g, x: tw.x, y: 1.0, z: tw.z, tx: target.x, ty: 0.5, tz: target.z, target, dmg: tw.dmg, slow: tw.slow, splash: tw.splash, color: col });
}

interface Particle { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; }
const PARTICLES: Particle[] = [];
// enemy flinch on hit — brief white flash + freeze + a little knockback
function hitReact(en: Enemy) {
  en.hitFlash = 0.15; en.hitStop = 0.07; en.dist = Math.max(0, en.dist - 0.16);
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
      en.hp -= dmg; en.slow = Math.max(en.slow, slow); hitReact(en);
      if (en.hpBar) drawHpBar(en.hpBar, en.hp / en.maxHp);
      if (en.hp <= 0) killEnemy(st, en, root);
    }
  }
}
// Block-Party-style death burst — bone shards + ectoplasm bits flung out + up
function deathBurst(fx: THREE.Group, x: number, z: number, color: number) {
  for (let i = 0; i < 16; i++) {
    const bone = Math.random() < 0.45;
    const col = bone ? 0xe8e4d2 : color;
    const m = ball(bone ? 0.07 : 0.09, col, x, 0.8 + Math.random() * 0.5, z);
    const mm = m.material as THREE.MeshStandardMaterial;
    if (!bone) { mm.emissive = new THREE.Color(color); mm.emissiveIntensity = 1.4; }
    m.castShadow = false; fx.add(m);
    const ang = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 4.5;
    PARTICLES.push({ m, vx: Math.sin(ang) * sp, vy: 3.5 + Math.random() * 4, vz: Math.cos(ang) * sp, life: 0.5 + Math.random() * 0.5 });
  }
}
// small grey foot-dust puffs (kicked up as characters walk) — like the store
function footDust(fx: THREE.Group, x: number, z: number) {
  for (let i = 0; i < 2; i++) {
    const m = ball(0.05 + Math.random() * 0.03, 0x8c8f86, x + (Math.random() - 0.5) * 0.2, 0.06, z + (Math.random() - 0.5) * 0.2);
    (m.material as THREE.MeshStandardMaterial).transparent = true;
    (m.material as THREE.MeshStandardMaterial).opacity = 0.55;
    m.castShadow = false; m.receiveShadow = false; fx.add(m);
    PARTICLES.push({ m, vx: (Math.random() - 0.5) * 0.5, vy: 0.5 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.5, life: 0.35 + Math.random() * 0.2 });
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
      life: 0.4 + Math.random() * 0.2,
    });
  }
}
function renderFx(fx: THREE.Group, dt: number) {
  for (let i = PARTICLES.length - 1; i >= 0; i--) {
    const p = PARTICLES[i];
    p.life -= dt;
    p.vy -= 9 * dt;
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    if (p.life <= 0 || p.m.position.y < 0) {
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
  const start = performance.now(); const y0 = g.position.y;
  function b() {
    const e = (performance.now() - start) / 250;
    if (e >= 1) { g.position.y = y0; return; }
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
  const count = 4 + st.wave * 2;
  st.spawnGap = Math.max(0.45, 1.15 - st.wave * 0.06);
  st.spawnQ = [];
  for (let i = 0; i < count; i++) {
    const def = pool[Math.floor(Math.random() * pool.length)];
    st.spawnQ.push(def);
  }
  st.spawnT = 0.3;
  sfx.wave();
  onWave(st.wave);
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
  for (const p of st.plots) { p.tower = null; p.marker.visible = true; }
  st.lives = START_LIVES; st.cash = START_CASH; st.score = 0; st.wave = 0;
  st.spawnQ = []; st.betweenWaves = true; st.waveBreak = 1.4; st.over = false;
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
