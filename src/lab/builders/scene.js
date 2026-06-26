// scene.js — 场景/环境地块 builders (material assets, category=scene).
// The world layer everything else sits on: chunky ground tiles (grass/road/water),
// a house module, fence, street lamp, and a teal-striped market stall (ties the set
// to the supermarket theme + family accent). Same flat-shaded voxel language; all
// tiles share a 1.0 footprint so they snap together. See DESIGN_SYSTEM.md.
import * as THREE from 'three';
import { P, box, cyl, cone } from '../lib/prims.js';

const TILE = 1.0, TH = 0.30;   // tile footprint + chunk height (Crossy-style slab)

// ─── grass tile: green slab + dirt underside + a few blades & a stone ─────────
export function grassTile(){
  const g=new THREE.Group();
  g.add(box(TILE,TH,TILE, P.leaf, 0,TH/2,0));                  // grass slab (top lit brightest)
  g.add(box(TILE,0.10,TILE, P.barkD, 0,0.05,0));             // dirt underside band
  for(const [bx,bz] of [[-0.28,0.20],[0.24,-0.18],[0.10,0.30]])
    g.add(box(0.05,0.16,0.05, P.leafD, bx,TH+0.08,bz));       // grass blades
  g.add(box(0.16,0.10,0.14, P.stone, 0.30,TH+0.05,0.28));     // a small stone
  return g;
}

// ─── road tile: asphalt slab + curbs + dashed center line (one accent: line) ──
export function roadTile(){
  const g=new THREE.Group();
  g.add(box(TILE,TH,TILE, P.slate, 0,TH/2,0));                // asphalt
  g.add(box(TILE,0.10,TILE, P.stoneD, 0,0.05,0));            // underside
  for(const sz of [-1,1]) g.add(box(TILE,0.04,0.08, P.panelD, 0,TH-0.01,sz*(TILE/2-0.04))); // slim flush curbs
  for(let i=-1;i<=1;i++) g.add(box(0.12,0.04,0.24, P.gold, 0,TH+0.01,i*0.36)); // dashed center line (brighter hero)
  return g;
}

// ─── water tile: muted blue slab + raised lighter ripple crests (the identifier)─
export function waterTile(){
  const g=new THREE.Group();
  g.add(box(TILE,0.10,TILE, P.stoneD, 0,0.05,0));            // basin underside
  g.add(box(TILE-0.02,TH-0.04,TILE-0.02, 0x4f8fb5, 0,(TH-0.04)/2,0)); // muted water body (lets triad read)
  // raised lighter ripple crests = the 2-second "this is water" feature
  for(const [rx,rz] of [[-0.22,-0.10],[0.06,0.18],[0.26,-0.22]])
    g.add(box(0.34,0.05,0.10, 0x7fb6d4, rx,TH-0.02,rz));      // crest bars (proud, lighter top)
  return g;
}

// ─── house: walls + hip roof + door + 2 windows + chimney ─────────────────────
export function house(){
  const g=new THREE.Group(); const W=1.0,H=0.74,D=0.86;
  g.add(box(W,0.06,D+0.06, P.stoneD, 0,0.03,0));             // footing
  g.add(box(W,H,D, P.cream, 0,0.06+H/2,0));                  // walls
  const roofY=0.06+H;
  const roof=cone(0.74,0.52,4, P.red, 0,roofY+0.26,0); roof.rotation.y=Math.PI/4; // hip roof, ~flush overhang
  g.add(roof);
  g.add(box(0.20,0.40,0.20, P.slate, W/2-0.26,roofY+0.20,-D/2+0.22)); // chimney (bigger)
  g.add(box(0.24,0.08,0.24, P.accent, W/2-0.26,roofY+0.42,-D/2+0.22)); // chimney cap (accent, legible)
  // front (+Z) face: door + windows
  g.add(box(0.26,0.46,0.05, P.woodD, 0,0.06+0.23,D/2+0.005));  // door
  g.add(box(0.06,0.06,0.05, P.gold, 0.08,0.06+0.22,D/2+0.02)); // door knob
  for(const sx of [-1,1]) g.add(box(0.22,0.22,0.05, P.coldGlow, sx*0.32,0.06+0.46,D/2+0.005, {e:P.coldGlow, ei:0.5})); // windows
  for(const sx of [-1,1]) g.add(box(0.26,0.26,0.02, P.panelD, sx*0.32,0.06+0.46,D/2+0.03)); // window frames behind
  return g;
}

// ─── fence: 2 posts + 2 rails (wood) ──────────────────────────────────────────
export function fence(){
  const g=new THREE.Group();
  for(const sx of [-1,1]) g.add(box(0.12,0.52,0.12, P.woodD, sx*0.40,0.26,0)); // posts
  for(const ry of [0.18,0.40]) g.add(box(0.92,0.08,0.07, P.woodM, 0,ry,0));    // rails
  for(const sx of [-1,1]) g.add(cone(0.10,0.10,4, P.woodD, sx*0.40,0.55,0));   // post caps
  return g;
}

// ─── street lamp: base + pole + lantern head (warm glow) ──────────────────────
export function lamp(){
  const g=new THREE.Group();
  g.add(cyl(0.20,0.24,0.10,8, P.slate, 0,0.05,0));           // base
  g.add(box(0.11,1.04,0.11, P.steel, 0,0.57,0));            // pole
  g.add(box(0.34,0.07,0.11, P.steel, 0.13,1.10,0));        // arm
  g.add(box(0.30,0.34,0.30, P.ironD, 0.30,0.96,0));        // chunky lantern housing
  for(const sz of [-1,1])                                    // bright emissive glass faces (hero)
    g.add(box(0.22,0.26,0.02, 0xffd24a, 0.30,0.96,sz*0.16, {e:0xffd24a, ei:1.0}));
  g.add(box(0.02,0.26,0.22, 0xffd24a, 0.30+0.16,0.96,0, {e:0xffd24a, ei:1.0}));
  g.add(cone(0.30,0.16,4, P.ironD, 0.30,1.21,0));         // lantern cap
  const funnel=cone(0.30,0.10,4, P.ironD, 0.30,0.74,0); funnel.rotation.x=Math.PI; g.add(funnel); // bottom funnel
  return g;
}

// ─── market stall: counter + teal-striped awning (family accent) + posts ──────
export function stall(){
  const g=new THREE.Group(); const W=1.0,H=0.50,D=0.56;
  g.add(box(W,H,D, P.woodM, 0,H/2,0));                       // counter body
  g.add(box(W+0.04,0.07,D+0.04, P.woodD, 0,H,0));          // counter top edge
  for(const sx of [-1,1]) g.add(box(0.07,0.70,0.07, P.woodD, sx*(W/2-0.05),H+0.35,-D/2+0.05)); // back posts
  // striped awning (alternating teal accent / cream)
  for(let i=0;i<5;i++) g.add(box(W/5,0.06,0.40, i%2?P.accent:P.cream, -W/2+W/10+i*(W/5),H+0.74,0.06));
  g.add(box(W,0.06,0.04, P.accent, 0,H+0.71,0.26));        // awning front lip
  // a few goods on the counter (locked product palette)
  g.add(box(0.16,0.18,0.13, P.red, -0.28,H+0.09,0.04));
  g.add(box(0.14,0.16,0.12, P.green, -0.06,H+0.08,-0.02));
  g.add(cyl(0.08,0.08,0.20,8, P.orange, 0.22,H+0.10,0.02, {r:0.5}));
  return g;
}

export const SCENE = { grassTile, roadTile, waterTile, house, fence, lamp, stall };
