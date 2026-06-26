import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  P, box, cyl, cone, ball,
  grassTile, roadTile, house, fence, lamp, PLANTS,
  CHARACTERS, ARCHETYPES, ANIMALS, rigOf,
} from './lab';
import { sfx } from './audio';

// ─── Tuning ────────────────────────────────────────────────────────────────
const START_CASH = 175;
const START_LIVES = 5;
const TOWER_COST = 90;
const UPGRADE_COST = (lvl: number) => 70 + lvl * 55;
const TOWER_MAX_LVL = 4;
const ENEMY_SCALE = 0.46;

// Lane: a straight dirt path down the centre. Enemies walk +z toward the house.
const SPAWN_Z = -7.2;
const HOUSE_Z = 3.4;
const LANE_HALF = 0.8;

// Tower plots flank the lane at two depths-of-field columns.
const PLOT_SPOTS: [number, number][] = [
  [-1.7, -4.2], [1.7, -4.2],
  [-1.7, -1.4], [1.7, -1.4],
  [-1.7, 1.2], [1.7, 1.2],
  [-3.0, -3.0], [3.0, -3.0],
  [-3.0, 0.0], [3.0, 0.0],
  [-3.0, 2.4], [3.0, 2.4],
];

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
function charDef(id: string, key: string, hp: number, spd: number, bounty: number, scale = 1): IntruderDef {
  return { id, make: () => CHARACTERS[key](), hp, spd, bounty, scale, legs: true };
}
function archDef(id: string, key: string, hp: number, spd: number, bounty: number, scale = 1): IntruderDef {
  return { id, make: () => ARCHETYPES[key](), hp, spd, bounty, scale, legs: true };
}
function aniDef(id: string, key: string, hp: number, spd: number, bounty: number, scale = 1): IntruderDef {
  return { id, make: () => ANIMALS[key].make(), hp, spd, bounty, scale, legs: false };
}

// pool grows with waves — early = critters & kids, later = rowdy & heavy
const ROSTER: IntruderDef[] = [
  aniDef('rabbit', 'rabbit', 18, 1.85, 6, 0.8),
  aniDef('duck', 'duck', 16, 1.5, 6, 0.85),
  charDef('kid', 'kid', 26, 1.25, 8),
  aniDef('dog', 'dog', 30, 1.5, 9, 0.95),
  charDef('student', 'student', 34, 1.15, 10),
  aniDef('cat', 'cat', 22, 1.7, 8, 0.8),
  aniDef('fox', 'fox', 28, 1.95, 11, 0.85),    // fast dasher
  archDef('delivery', 'delivery', 44, 1.05, 13),
  charDef('teen', 'teen', 40, 1.2, 12),
  archDef('punk', 'punk', 50, 1.1, 15),
  archDef('rapper', 'rapper', 56, 1.05, 16),
  aniDef('pig', 'pig', 70, 0.9, 18, 1.05),
  archDef('biker', 'biker', 90, 0.95, 22, 1.05),
  aniDef('bear', 'bear', 180, 0.7, 45, 1.25),  // heavy tank boss
];
function poolForWave(w: number): IntruderDef[] {
  // unlock ~2 new roster entries per wave
  const n = Math.min(ROSTER.length, 3 + w * 2);
  return ROSTER.slice(0, n);
}

// ─── Entity types ───────────────────────────────────────────────────────────
interface Enemy {
  g: THREE.Group; def: IntruderDef;
  x: number; z: number; laneOff: number;
  hp: number; maxHp: number; spd: number;
  phase: number; dead: boolean; reached: boolean;
  slow: number; // remaining slow timer (sec)
  hpBar: THREE.Sprite | null;
}
interface Tower {
  g: THREE.Group; head: THREE.Object3D; ring: THREE.Mesh;
  x: number; z: number; level: number;
  range: number; dmg: number; rate: number; cd: number; yaw: number;
}
interface Plot { x: number; z: number; disc: THREE.Mesh; marker: THREE.Group; tower: Tower | null; }
interface Proj { g: THREE.Mesh; x: number; y: number; z: number; tx: number; ty: number; tz: number; target: Enemy; dmg: number; }

export interface HudState { lives: number; cash: number; score: number; wave: number; }
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
function flatify(g: THREE.Object3D, opts?: { cast?: boolean; receive?: boolean }) {
  const cast = opts?.cast ?? true;
  const receive = opts?.receive ?? true;
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const m = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (m && 'flatShading' in m) { m.flatShading = true; m.needsUpdate = true; }
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  });
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
    lastHud: { lives: -1, cash: -1, score: -1, wave: -1 } as HudState,
    fxLayer: fx as THREE.Group,
    onHud: onHud as (h: HudState) => void,
    motes: null as THREE.Points | null,
  });

  // camera setup — orthographic iso diorama (premium clean-iso look)
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.position.set(8.5, 11.5, 12.5);
    cam.zoom = 78; cam.near = 0.1; cam.far = 200;
    cam.lookAt(0, 0.3, -1.1);
    cam.updateProjectionMatrix();
  }, [camera]);

  // build the static board once
  useEffect(() => {
    scene.add(makeSkyDome());
    scene.fog = new THREE.Fog(0xe9d3b0, 26, 46); // warm golden-hour haze
    buildBoard(root, S.current);
    const motes = makeMotes(); scene.add(motes); S.current.motes = motes;
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
      [-5, -3.5, -2, -0.5, 1].forEach((z, i) => {
        spawnEnemy(root, st, dbgPool[i % dbgPool.length]);
        st.enemies[st.enemies.length - 1].z = z;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ─── main loop ───
  useFrame((_, dtRaw) => {
    const st = S.current;
    const dt = Math.min(dtRaw, 0.05);
    st.time += dt;

    if (st.motes) { st.motes.rotation.y += dt * 0.03; st.motes.position.y = Math.sin(st.time * 0.35) * 0.18; }

    // idle bob of plot markers (attract attention to affordable spots)
    for (const p of st.plots) {
      if (p.tower) continue;
      const aff = st.cash >= TOWER_COST;
      p.marker.visible = true;
      const pulse = 1 + Math.sin(st.time * 3 + p.x) * 0.12;
      p.marker.scale.setScalar(aff ? pulse : 0.85);
      (p.marker.children[0] as THREE.Mesh).visible = aff;
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

    // ── enemies march ──
    for (const en of st.enemies) {
      if (en.dead) continue;
      let spd = en.spd;
      if (en.slow > 0) { en.slow -= dt; spd *= 0.5; }
      en.z += spd * dt;
      en.phase += dt * spd * 3.2;
      const gx = en.laneOff;
      en.g.position.set(gx, 0, en.z);
      // walk anim
      if (en.def.legs) {
        const rig = rigOf(en.g);
        const sw = Math.sin(en.phase) * 0.5;
        if (rig?.legL) rig.legL.rotation.x = sw;
        if (rig?.legR) rig.legR.rotation.x = -sw;
        if (rig?.armL) rig.armL.rotation.x = -sw * 0.7;
        if (rig?.armR) rig.armR.rotation.x = sw * 0.7;
        en.g.position.y = Math.abs(Math.sin(en.phase)) * 0.04;
      } else {
        en.g.position.y = Math.abs(Math.sin(en.phase)) * 0.09;
      }
      if (en.hpBar) en.hpBar.position.set(gx, 1.5 * en.def.scale * ENEMY_SCALE + 0.9, en.z);
      // reached the house
      if (en.z >= HOUSE_Z) {
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
      // find nearest live enemy in range (prefer most advanced = highest z)
      let best: Enemy | null = null; let bestZ = -Infinity;
      for (const en of st.enemies) {
        if (en.dead) continue;
        const dx = en.laneOff - tw.x, dz = en.z - tw.z;
        if (dx * dx + dz * dz <= tw.range * tw.range && en.z > bestZ) { best = en; bestZ = en.z; }
      }
      if (best) {
        const desired = Math.atan2(best.laneOff - tw.x, best.z - tw.z);
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
      if (!en.dead) { pr.tx = en.laneOff; pr.tz = en.z; pr.ty = 0.5; }
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
  // soft sage lawn base (receives shadows, doesn't cast)
  const base = box(11, 0.4, 16, 0x9cb568, 0, -0.2, -1.5);
  flatify(base, { cast: false, receive: true }); root.add(base);
  // warm soil rim
  const rim = box(11.6, 0.3, 16.6, 0x6f6a3c, 0, -0.42, -1.5);
  flatify(rim, { cast: false, receive: true }); root.add(rim);

  // warm packed-dirt garden path down the lane (on-theme; no urban asphalt)
  const pathLen = (HOUSE_Z + 1.0) - (SPAWN_Z - 0.2);
  const pathMid = (SPAWN_Z - 0.2 + HOUSE_Z + 1.0) / 2;
  const dirt = box(1.78, 0.16, pathLen, 0x9c7c4d, 0, 0.06, pathMid);
  flatify(dirt, { cast: false, receive: true }); root.add(dirt);
  const dirt2 = box(1.5, 0.2, pathLen - 0.3, 0xab8a58, 0, 0.08, pathMid);
  flatify(dirt2, { cast: false, receive: true }); root.add(dirt2);
  for (const sx of [-1, 1]) {                       // pale stone edging
    const edge = box(0.14, 0.2, pathLen, 0xc4b89a, sx * 0.92, 0.09, pathMid);
    flatify(edge, { cast: false, receive: true }); root.add(edge);
  }
  // a few embedded flagstones for texture
  for (let k = 0; k < 9; k++) {
    const fx2 = ((k * 3.1) % 1.2) - 0.6;
    const fz = SPAWN_Z + 0.4 + k * 1.15;
    const stone = box(0.5, 0.05, 0.42, k % 2 ? 0xb6a888 : 0xc0b294, fx2, 0.15, fz);
    flatify(stone, { cast: false, receive: true }); root.add(stone);
  }

  // grass texture tufts beside the lane
  for (let k = 0; k < 26; k++) {
    const ang = (k * 2.4) % 1;
    const x = (ang < 0.5 ? -1 : 1) * (1.6 + (k % 4) * 0.45);
    const z = SPAWN_Z + (k * 0.55) % 12;
    const tuft = box(0.12, 0.22 + (k % 3) * 0.05, 0.12, 0x6f9a3e, x, 0.1, z);
    flatify(tuft); root.add(tuft);
  }

  // the house = the core you defend (just behind the lane's end)
  const h = house();
  h.scale.setScalar(1.55);
  h.position.set(0, 0, HOUSE_Z + 0.7);   // front door (+Z face) toward the camera
  flatify(h); root.add(h); st.houseGroup = h;

  // a lamp by the porch for character
  const lp = lamp(); lp.scale.setScalar(1.5); lp.position.set(2.2, 0, HOUSE_Z + 1.1); flatify(lp); root.add(lp);

  // fence border along the back
  for (let i = -4; i <= 4; i++) {
    const f = fence(); f.position.set(i * 1.0, 0, SPAWN_Z - 0.1); f.scale.set(1, 1.1, 1);
    flatify(f); root.add(f);
  }

  // decorative plants in the corners
  const decoSpots: [number, number, string][] = [
    [-4.2, HOUSE_Z + 1.0, 'roundTree'], [4.2, SPAWN_Z + 1.2, 'pine'],
    [-4.3, -1.5, 'bush'], [4.3, HOUSE_Z, 'roundTree'], [-4.2, SPAWN_Z + 2, 'pine'],
  ];
  for (const [x, z, kind] of decoSpots) {
    const pl = PLANTS[kind](); pl.position.set(x, 0, z); pl.scale.setScalar(1.1);
    flatify(pl); root.add(pl);
  }

  // tower plots
  for (const [x, z] of PLOT_SPOTS) {
    const plot = makePlot(x, z);
    root.add(plot.disc); root.add(plot.marker);
    st.plots.push(plot);
  }
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

  // visible marker: dashed ring + a small "+"
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.46, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  const plus = new THREE.Group();
  const c = 0xfff27a;
  plus.add(box(0.26, 0.05, 0.08, c, 0, 0.12, 0));
  plus.add(box(0.08, 0.05, 0.26, c, 0, 0.12, 0));
  marker.add(plus); marker.add(ring);
  marker.position.set(x, 0, z);
  return { x, z, disc, marker, tower: null };
}

// ─── towers ─────────────────────────────────────────────────────────────────
const LVL_COLOR = [0x3fb6ac, 0x57c8e0, 0x6ee05a, 0xffd23f, 0xff7a4d];
function plantTower(root: THREE.Group, plot: Plot): Tower {
  const g = new THREE.Group();
  g.position.set(plot.x, 0, plot.z);
  // base — a little garden planter the sprinkler sits in
  const base = cyl(0.42, 0.5, 0.24, 8, 0x7c5230, 0, 0.12, 0); flatify(base); g.add(base);
  const soil = cyl(0.36, 0.36, 0.06, 8, 0x3f2d1c, 0, 0.25, 0); flatify(soil); g.add(soil);
  const post = cyl(0.13, 0.16, 0.62, 8, 0x9aa1a8, 0, 0.56, 0); flatify(post); g.add(post);
  // head (rotates to aim) — a sprinkler nozzle
  const head = new THREE.Group(); head.position.y = 0.86;
  const body = ball(0.26, LVL_COLOR[0], 0, 0, 0); flatify(body); head.add(body);
  const nozzle = cyl(0.06, 0.11, 0.4, 8, 0x4a3526, 0, 0.08, 0.28); nozzle.rotation.x = Math.PI / 2; flatify(nozzle); head.add(nozzle);
  const tip = ball(0.08, 0x9fd6ff, 0, 0.08, 0.46); flatify(tip); head.add(tip);
  g.add(head);
  // range ring (faint)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.1, 28),
    new THREE.MeshBasicMaterial({ color: 0x3fb6ac, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  root.add(g);
  const tw: Tower = { g, head, ring, x: plot.x, z: plot.z, level: 1, range: 2.8, dmg: 9, rate: 1.6, cd: 0, yaw: 0 };
  applyTowerLevel(tw);
  return tw;
}
function applyTowerLevel(tw: Tower) {
  tw.range = 2.5 + tw.level * 0.45;
  tw.dmg = 6 + tw.level * 5;
  tw.rate = 1.3 + tw.level * 0.35;
  const col = LVL_COLOR[Math.min(tw.level, LVL_COLOR.length - 1)];
  const body = tw.head.children[0] as THREE.Mesh;
  (body.material as THREE.MeshStandardMaterial).color.setHex(col);
  body.scale.setScalar(1 + (tw.level - 1) * 0.18);
  // range ring radius
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
  g.position.set(laneOff, 0, SPAWN_Z);
  // characters face +Z by default; quadruped animals face +X → rotate to +Z
  g.rotation.y = def.legs ? 0 : -Math.PI / 2;
  root.add(g);
  const hpBar = makeHpBar();
  drawHpBar(hpBar, 1);
  // hpBar added to fx layer so it renders over geometry
  st.fxLayer.add(hpBar);
  const hpScaled = Math.round(def.hp * (1 + st.wave * 0.12));
  const en: Enemy = {
    g, def, x: laneOff, z: SPAWN_Z, laneOff,
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
  const g = ball(0.12, 0x9fd6ff, 0, 0, 0);
  (g.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x2a6fb0);
  g.position.set(tw.x, 0.86, tw.z);
  fx.add(g);
  st.projs.push({ g, x: tw.x, y: 0.86, z: tw.z, tx: target.laneOff, ty: 0.5, tz: target.z, target, dmg: tw.dmg });
}

interface Particle { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; }
const PARTICLES: Particle[] = [];
function splash(fx: THREE.Group, x: number, y: number, z: number) {
  for (let i = 0; i < 5; i++) {
    const m = ball(0.06, 0xbfe6ff, x, y, z);
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
  if (last.lives !== st.lives || last.cash !== st.cash || last.score !== st.score || last.wave !== st.wave) {
    st.lastHud = { lives: st.lives, cash: st.cash, score: st.score, wave: st.wave };
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
  st.lastHud = { lives: -1, cash: -1, score: -1, wave: -1 };
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
        top: { value: new THREE.Color(0x7ea8d6) },   // soft periwinkle crown
        mid: { value: new THREE.Color(0xf2ddb4) },   // warm cream band
        bot: { value: new THREE.Color(0xf3c489) },   // peachy horizon
        glow: { value: new THREE.Color(0xffe3a6) },  // amber sun glow
        glowDir: { value: new THREE.Vector3(-0.5, -0.05, -0.6).normalize() },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 glow; uniform vec3 glowDir; void main(){ vec3 n = normalize(vP); float h = n.y; vec3 c = h > 0.0 ? mix(mid, top, clamp(h*1.2,0.0,1.0)) : mix(mid, bot, clamp(-h*1.7,0.0,1.0)); float g = clamp(dot(n, glowDir), 0.0, 1.0); c = mix(c, glow, g*g*0.6); gl_FragColor = vec4(c,1.0); }',
    }),
  );
}

// ─── floating pollen / dust motes catching the warm light ────────────────────
function makeMotes(): THREE.Points {
  const N = 80;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 6;
    pos[i * 3 + 1] = Math.random() * 5 + 0.4;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 7 - 1;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xfff0cf, size: 0.09, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
  }));
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
      <hemisphereLight args={[0xfde6c8, 0x4f6a38, 0.62]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        ref={keyRef}
        position={[7, 13, 6]}
        intensity={1.45}
        color={0xffe7bd}
        castShadow
      />
      <directionalLight position={[-8, 5, -7]} intensity={0.34} color={0x9fc9e0} />
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
        toneMappingExposure: 1.06,
      }}
      camera={{ position: [9, 12, 13], zoom: 52, near: 0.1, far: 200 }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <Lights />
      <World {...props} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.42} luminanceThreshold={0.72} luminanceSmoothing={0.18} />
        <Vignette eskil={false} offset={0.18} darkness={0.62} />
      </EffectComposer>
    </Canvas>
  );
}
