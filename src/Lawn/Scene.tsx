import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  P, box, cyl, cone, ball,
  fence, lamp, PLANTS,
  CHARACTERS, MONSTERS, rigOf,
} from './lab';
import { sfx } from './audio';

// ─── Tuning ────────────────────────────────────────────────────────────────
const START_CASH = 175;
const START_LIVES = 5;
const TOWER_COST = 90;
const UPGRADE_COST = (lvl: number) => 70 + lvl * 55;
const TOWER_MAX_LVL = 4;
const ENEMY_SCALE = 0.46;

// ── Winding grave-path: a snaking route from the gate (top) to the crypt (front).
// A circuitous path = more fun TD (towers in the bend pockets cover several
// segments). Enemies follow it by cumulative distance.
const PATH: [number, number][] = [
  [0.0, -6.9],
  [-2.6, -4.3],
  [2.6, -1.5],
  [-2.3, 1.2],
  [0.0, 3.2],
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

// Tower plots flank the winding path in tidy symmetric pairs (computed from the
// path so they always hug the curves). Each sits on a stone build-pad.
const PLOT_SPOTS: [number, number][] = (() => {
  const spots: [number, number][] = [];
  for (const frac of [0.14, 0.31, 0.48, 0.65, 0.82]) {
    const p = posAlong(frac * PATH_TOTAL);
    for (const side of [-1, 1]) {
      const x = p.x + p.px * side * 1.8;
      const z = p.z + p.pz * side * 1.8;
      if (Math.abs(x) < 4.7) spots.push([+x.toFixed(2), +z.toFixed(2)]);
    }
  }
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
function deadDef(id: string, key: string, hp: number, spd: number, bounty: number, scale = 1): IntruderDef {
  // the freshly-dead — ordinary people who just died, come to squat your plot
  return { id, make: () => paleDead(CHARACTERS[key]()), hp, spd, bounty, scale, legs: true };
}
function monDef(id: string, key: string, hp: number, spd: number, bounty: number, scale = 1, legs = true): IntruderDef {
  return { id, make: () => MONSTERS[key](), hp, spd, bounty, scale, legs };
}

// pool grows with waves — early = wisps & the freshly dead, later = heavy undead + werewolf boss
const ROSTER: IntruderDef[] = [
  monDef('ghost', 'ghost', 16, 2.0, 7, 0.95, false),   // fast floating wisp
  deadDef('kid', 'kid', 24, 1.3, 8),
  monDef('skeleton', 'skeleton', 26, 1.55, 9, 0.95),
  deadDef('student', 'student', 34, 1.18, 10),
  deadDef('officeWoman', 'officeWoman', 36, 1.15, 11),
  monDef('zombie', 'zombie', 58, 0.92, 14, 1.0),       // slow tank
  deadDef('businessman', 'businessman', 44, 1.1, 13),
  monDef('mummy', 'mummy', 72, 0.82, 16, 1.0),
  monDef('vampire', 'vampire', 64, 1.32, 18, 1.0),     // fast + tanky
  deadDef('teen', 'teen', 40, 1.22, 12),
  monDef('werewolf', 'werewolf', 190, 0.98, 48, 1.22),  // heavy boss
];
function poolForWave(w: number): IntruderDef[] {
  // unlock ~2 new roster entries per wave
  const n = Math.min(ROSTER.length, 3 + w * 2);
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
}
interface Tower {
  g: THREE.Group; head: THREE.Object3D; ring: THREE.Mesh;
  x: number; z: number; level: number;
  range: number; dmg: number; rate: number; cd: number; yaw: number;
  light?: THREE.PointLight; flicker: number;
}
interface Plot { x: number; z: number; disc: THREE.Mesh; marker: THREE.Group; ring: THREE.Mesh; ghost: THREE.Group; tower: Tower | null; }
interface Proj { g: THREE.Mesh; x: number; y: number; z: number; tx: number; ty: number; tz: number; target: Enemy; dmg: number; }

export interface HudState { lives: number; cash: number; score: number; wave: number; towers: number; }
export interface SceneHandle { restart: () => void; }

type Mode = 'attract' | 'play' | 'over';
interface Props {
  mode: Mode;
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
function World({ mode, onHud, onWave, onGameOver, registerRestart }: Props) {
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
  });

  // camera setup — orthographic iso diorama (premium clean-iso look)
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.position.set(9.0, 12.0, 13.0);
    cam.zoom = 58; cam.near = 0.1; cam.far = 200;   // pulled back so the whole winding path + plots read
    cam.lookAt(0, 0.2, -1.4);
    cam.updateProjectionMatrix();
  }, [camera]);

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
    function onDown(e: PointerEvent) {
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
        if (st.cash >= TOWER_COST) {
          st.cash -= TOWER_COST;
          plot.tower = plantTower(root, plot);
          st.towers.push(plot.tower);
          plot.marker.visible = false;
          sfx.plant();
          pushHud(st);
        } else { bounce(plot.marker); }
      } else {
        const tw = plot.tower;
        if (tw.level >= TOWER_MAX_LVL) { return; }
        const cost = UPGRADE_COST(tw.level);
        if (st.cash >= cost) {
          st.cash -= cost; upgradeTower(tw); sfx.upgrade(); pushHud(st);
          ringPulse(fx, tw.x, tw.z);
        } else { bounce(tw.g); }
      }
    }
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, camera, gl]);

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
      for (const idx of [2, 3, 1]) {
        const plot = st.plots[idx];
        if (plot && !plot.tower) {
          plot.tower = plantTower(root, plot);
          if (idx === 3) { upgradeTower(plot.tower); upgradeTower(plot.tower); }
          st.towers.push(plot.tower); plot.marker.visible = false;
        }
      }
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
      const aff = st.cash >= TOWER_COST;
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
        for (const idx of [2, 3]) {
          const plot = st.plots[idx];
          if (plot && !plot.tower) {
            plot.tower = plantTower(root, plot);
            if (idx === 3) upgradeTower(plot.tower);
            st.towers.push(plot.tower); plot.marker.visible = false;
          }
        }
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
      if (en.dead) continue;
      let spd = en.spd;
      if (en.slow > 0) { en.slow -= dt; spd *= 0.5; }
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
        if (!en.dead) {
          en.hp -= pr.dmg; en.slow = Math.max(en.slow, 0.5);
          if (en.hpBar) drawHpBar(en.hpBar, en.hp / en.maxHp);
          splash(fx, pr.x, 0.4, pr.z);
          if (en.hp <= 0) killEnemy(st, en, root);
        }
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
      if (en.dead) {
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

  // winding cobbled grave-path — a lit dirt band per segment + bend-fills, with
  // pale stone edging so the route reads clearly against the dark ground
  for (const s of PATH_SEGS) {
    const midx = s.ax + s.dx * s.len / 2, midz = s.az + s.dz * s.len / 2;
    const band = box(1.78, 0.16, s.len + 0.6, 0x564a3a, midx, 0.06, midz);
    band.rotation.y = Math.atan2(s.dx, s.dz);
    flatify(band, { cast: false, receive: true }); root.add(band);
  }
  for (let i = 1; i < PATH.length - 1; i++) {        // fill the bend joints
    const fill = box(1.82, 0.16, 1.82, 0x564a3a, PATH[i][0], 0.058, PATH[i][1]);
    flatify(fill, { cast: false, receive: true }); root.add(fill);
  }
  for (let d = 0.3; d < PATH_TOTAL; d += 0.5) {       // cobbles + glowing kerb edging
    const p = posAlong(d);
    const off = ((d * 1.7) % 1.0) - 0.5;
    const cx = p.x + p.px * off, cz = p.z + p.pz * off;
    const stone = box(0.42, 0.06, 0.36, (d | 0) % 2 ? 0x7a7d6a : 0x888b77, cx, 0.16, cz);
    stone.rotation.y = Math.atan2(p.dx, p.dz);
    flatify(stone, { cast: false, receive: true }); root.add(stone);
    // pale kerb stones on both edges, with a faint spectral glow cap → the winding
    // route is outlined by a soft green line that reads clearly in the dark
    for (const side of [-1, 1]) {
      const ex = p.x + p.px * side * 0.94, ez = p.z + p.pz * side * 0.94;
      const kerb = box(0.2, 0.16, 0.34, 0x868b76, ex, 0.1, ez);
      kerb.rotation.y = Math.atan2(p.dx, p.dz);
      flatify(kerb, { cast: false, receive: true }); root.add(kerb);
      const glow = box(0.12, 0.04, 0.34, 0x6fe0a8, ex, 0.2, ez, { e: 0x4fc88c, ei: 0.7 });
      glow.rotation.y = Math.atan2(p.dx, p.dz); glow.castShadow = false; glow.receiveShadow = false;
      root.add(glow);
    }
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
// spectral flame colours by level — eerie green → teal → cyan → violet
const LVL_COLOR = [0x52b46e, 0x44c9aa, 0x63d2e6, 0xb583ec, 0xffa85c];
function plantTower(root: THREE.Group, plot: Plot): Tower {
  const g = new THREE.Group();
  g.position.set(plot.x, 0, plot.z);
  // a grave brazier on a dark stone plinth
  const base = cyl(0.44, 0.52, 0.22, 8, 0x474b46, 0, 0.11, 0); flatify(base); g.add(base);
  const post = cyl(0.11, 0.13, 0.58, 8, 0x2a2c29, 0, 0.5, 0); flatify(post); g.add(post);
  const bowl = cyl(0.3, 0.18, 0.22, 10, 0x33352f, 0, 0.84, 0); flatify(bowl); g.add(bowl);
  // head holds the spectral flame (head.children[0] = flame, recoloured on upgrade)
  const head = new THREE.Group(); head.position.y = 0.98;
  const flame = ball(0.24, LVL_COLOR[0], 0, 0, 0, 1);
  (flame.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(LVL_COLOR[0]);
  (flame.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4;
  flame.castShadow = false; head.add(flame);
  g.add(head);
  // flickering point light → warm pool on the surrounding graves (the "texture")
  const light = new THREE.PointLight(LVL_COLOR[0], 6, 3.4, 2);
  light.position.set(0, 1.0, 0); light.castShadow = false; g.add(light);
  // range ring (faint spectral)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.1, 28),
    new THREE.MeshBasicMaterial({ color: 0x52b46e, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  root.add(g);
  const tw: Tower = { g, head, ring, x: plot.x, z: plot.z, level: 1, range: 2.8, dmg: 9, rate: 1.6, cd: 0, yaw: 0, light, flicker: Math.random() * 6 };
  applyTowerLevel(tw);
  return tw;
}
function applyTowerLevel(tw: Tower) {
  tw.range = 2.5 + tw.level * 0.45;
  tw.dmg = 6 + tw.level * 5;
  tw.rate = 1.3 + tw.level * 0.35;
  const col = LVL_COLOR[Math.min(tw.level, LVL_COLOR.length - 1)];
  const flame = tw.head.children[0] as THREE.Mesh;
  const fm = flame.material as THREE.MeshStandardMaterial;
  fm.color.setHex(col); fm.emissive.setHex(col);
  flame.scale.setScalar(1 + (tw.level - 1) * 0.2);
  if (tw.light) { tw.light.color.setHex(col); tw.light.intensity = 5 + tw.level * 1.6; tw.light.distance = 3 + tw.level * 0.4; }
  tw.ring.geometry.dispose();
  tw.ring.geometry = new THREE.RingGeometry(tw.range - 0.06, tw.range, 40);
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
  };
  st.enemies.push(en);
}
function killEnemy(st: any, en: Enemy, _root: THREE.Group) {
  en.dead = true;
  st.cash += en.def.bounty;
  st.score += 1;
  sfx.splat();
  if (Math.random() < 0.5) sfx.coin();
  pushHud(st);
}

// ─── projectiles + fx ───────────────────────────────────────────────────────
function fireWater(fx: THREE.Group, st: any, tw: Tower, target: Enemy) {
  const col = LVL_COLOR[Math.min(tw.level, LVL_COLOR.length - 1)];
  const g = ball(0.14, col, 0, 0, 0, 1);
  const gm = g.material as THREE.MeshStandardMaterial;
  gm.emissive = new THREE.Color(col); gm.emissiveIntensity = 1.6;
  g.castShadow = false;
  g.position.set(tw.x, 1.0, tw.z);
  fx.add(g);
  st.projs.push({ g, x: tw.x, y: 1.0, z: tw.z, tx: target.x, ty: 0.5, tz: target.z, target, dmg: tw.dmg });
}

interface Particle { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; }
const PARTICLES: Particle[] = [];
function splash(fx: THREE.Group, x: number, y: number, z: number) {
  for (let i = 0; i < 6; i++) {
    const m = ball(0.06, 0x8fe6b8, x, y, z);
    (m.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x4fae7a);
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
function ringPulse(fx: THREE.Group, x: number, z: number) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.34, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
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
