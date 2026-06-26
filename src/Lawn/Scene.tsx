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
  light?: THREE.PointLight; flicker: number;
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
    lastHud: { lives: -1, cash: -1, score: -1, wave: -1 } as HudState,
    fxLayer: fx as THREE.Group,
    onHud: onHud as (h: HudState) => void,
    motes: null as THREE.Points | null,
    mist: null as THREE.Group | null,
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
    scene.fog = new THREE.Fog(0x141c28, 11, 30); // dense graveyard mist
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

    if (st.motes) { st.motes.rotation.y += dt * 0.02; st.motes.position.y = Math.sin(st.time * 0.3) * 0.14; }
    if (st.mist) {
      for (const m of st.mist.children) {
        m.position.x += (m as any).__sp * (m as any).__dir * dt;
        m.rotation.z += dt * 0.04 * (m as any).__dir;
        if (m.position.x > 5) (m as any).__dir = -1;
        if (m.position.x < -5) (m as any).__dir = 1;
      }
    }

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
      // brazier flame flicker → restless pool of light
      tw.flicker += dt * 11;
      if (tw.light) tw.light.intensity = (5 + tw.level * 1.6) * (0.78 + 0.22 * Math.sin(tw.flicker) + 0.08 * Math.sin(tw.flicker * 2.7));
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
  // dark mossy graveyard ground (receives the long moonlight shadows)
  const base = box(11, 0.4, 16, 0x36402f, 0, -0.2, -1.5);
  flatify(base, { cast: false, receive: true }); root.add(base);
  const rim = box(11.6, 0.3, 16.6, 0x201b15, 0, -0.42, -1.5);
  flatify(rim, { cast: false, receive: true }); root.add(rim);
  // mossy darker blotches on the ground for texture
  for (let k = 0; k < 16; k++) {
    const mx = ((k * 4.7) % 9) - 4.5, mz = SPAWN_Z + ((k * 2.3) % 13);
    if (Math.abs(mx) < 1.2) continue;
    const moss = box(0.7 + (k % 3) * 0.3, 0.02, 0.6 + (k % 2) * 0.4, k % 2 ? 0x2c3626 : 0x3f4a33, mx, 0.02, mz);
    flatify(moss, { cast: false, receive: true }); root.add(moss);
  }

  // cobbled grave-path down the lane (dark earth + mossy stone edging)
  const pathLen = (HOUSE_Z + 1.0) - (SPAWN_Z - 0.2);
  const pathMid = (SPAWN_Z - 0.2 + HOUSE_Z + 1.0) / 2;
  const dirt = box(1.8, 0.16, pathLen, 0x39342c, 0, 0.06, pathMid);
  flatify(dirt, { cast: false, receive: true }); root.add(dirt);
  for (const sx of [-1, 1]) {
    const edge = box(0.16, 0.22, pathLen, 0x565d4b, sx * 0.92, 0.1, pathMid);
    flatify(edge, { cast: false, receive: true }); root.add(edge);
  }
  for (let k = 0; k < 10; k++) {                    // cobblestones
    const cx = ((k * 3.1) % 1.2) - 0.6;
    const cz = SPAWN_Z + 0.4 + k * 1.1;
    const stone = box(0.46, 0.06, 0.4, k % 2 ? 0x4a4d42 : 0x55594c, cx, 0.14, cz);
    flatify(stone, { cast: false, receive: true }); root.add(stone);
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

  // graveyard lamp-posts flanking the crypt (dim warm glow → blooms in the dark)
  for (const sx of [-1, 1]) {
    const lp = lamp(); lp.scale.setScalar(1.45);
    lp.position.set(sx * 2.4, 0, HOUSE_Z + 0.6); lp.rotation.y = sx < 0 ? Math.PI : 0;
    flatify(lp); root.add(lp);
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

  // tower plots
  for (const [x, z] of PLOT_SPOTS) {
    const plot = makePlot(x, z);
    root.add(plot.disc); root.add(plot.marker);
    st.plots.push(plot);
  }
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
  const stone = 0x6a6f69, stoneD = 0x4c504b, dark = 0x14140f;
  g.add(flatify(box(2.0, 0.18, 1.7, stoneD, 0, 0.09, 0)));          // plinth
  g.add(flatify(box(1.7, 1.15, 1.4, stone, 0, 0.75, 0)));           // walls
  for (const sx of [-1, 1])                                          // corner pilasters
    g.add(flatify(box(0.22, 1.2, 0.22, stoneD, sx * 0.82, 0.78, 0.6)));
  const roof = cone(1.45, 0.6, 4, stoneD, 0, 1.62, 0); roof.rotation.y = Math.PI / 4; g.add(flatify(roof));
  // dark archway doorway with a faint spectral glow within
  g.add(flatify(box(0.62, 0.86, 0.1, dark, 0, 0.5, 0.71)));
  const glow = box(0.5, 0.72, 0.04, 0x2f8f63, 0, 0.46, 0.74, { e: 0x2f8f63, ei: 0.9 });
  glow.castShadow = false; g.add(glow);
  // a stone cross crowning the roof
  g.add(flatify(box(0.12, 0.5, 0.12, stone, 0, 2.1, 0)));
  g.add(flatify(box(0.34, 0.12, 0.12, stone, 0, 2.18, 0)));
  g.scale.setScalar(1.25);
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

  // visible marker: dashed ring + a small "+"
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.46, 20),
    new THREE.MeshBasicMaterial({ color: 0x9fe0c0, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  const plus = new THREE.Group();
  const c = 0x8fe6b8;
  plus.add(box(0.26, 0.05, 0.08, c, 0, 0.12, 0));
  plus.add(box(0.08, 0.05, 0.26, c, 0, 0.12, 0));
  marker.add(plus); marker.add(ring);
  marker.position.set(x, 0, z);
  return { x, z, disc, marker, tower: null };
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
  const col = LVL_COLOR[Math.min(tw.level, LVL_COLOR.length - 1)];
  const g = ball(0.14, col, 0, 0, 0, 1);
  const gm = g.material as THREE.MeshStandardMaterial;
  gm.emissive = new THREE.Color(col); gm.emissiveIntensity = 1.6;
  g.castShadow = false;
  g.position.set(tw.x, 1.0, tw.z);
  fx.add(g);
  st.projs.push({ g, x: tw.x, y: 1.0, z: tw.z, tx: target.laneOff, ty: 0.5, tz: target.z, target, dmg: tw.dmg });
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
        top: { value: new THREE.Color(0x080b16) },   // near-black navy crown
        mid: { value: new THREE.Color(0x161f31) },   // deep night blue
        bot: { value: new THREE.Color(0x26302e) },   // murky grey-green horizon mist
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
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.18, depthWrite: false,
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
      <hemisphereLight args={[0x46587a, 0x10140f, 0.6]} />
      <ambientLight intensity={0.14} />
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
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.5} luminanceSmoothing={0.22} />
        <Vignette eskil={false} offset={0.12} darkness={0.86} />
      </EffectComposer>
    </Canvas>
  );
}
