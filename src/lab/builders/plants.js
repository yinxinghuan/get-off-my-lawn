// plants.js — 植物/自然 builders (material assets, category=plants).
// Same visual language as the rest of the library: flat-shaded boxes, low-seg
// cylinders, faceted icosahedron foliage, cones for conifers. Nature palette from
// P (leaf/bark/petal/fruit). One saturated accent per object; structure muted.
// The potted plant uses the family teal P.accent to tie nature into the set.
import * as THREE from 'three';
import { P, box, cyl, ball, cone, darken } from '../lib/prims.js';

// ─── conifer / pine: tapered trunk + 3 stacked faceted cones ──────────────────
export function pine(){
  const g=new THREE.Group();
  g.add(cyl(0.10,0.13,0.34,6, P.bark, 0,0.17,0));               // trunk
  g.add(cone(0.46,0.46,7, P.leafD, 0,0.55,0));                  // lower tier (darkest)
  g.add(cone(0.38,0.44,7, P.leaf,  0,0.86,0));                  // mid tier
  g.add(cone(0.27,0.40,7, P.leafL, 0,1.18,0));                  // top tier (lightest)
  g.add(box(0.05,0.05,0.05, P.gold, 0.02,1.40,0));             // tiny tip nub (one accent)
  return g;
}

// ─── broadleaf round tree: trunk + clustered faceted balls (3-value foliage) ──
export function roundTree(){
  const g=new THREE.Group();
  g.add(cyl(0.14,0.17,0.48,6, P.bark, 0,0.24,0));               // trunk (thicker)
  g.add(cyl(0.20,0.24,0.07,6, P.barkD, 0,0.035,0));            // small root flare (narrower+shorter)
  const cy=0.80;
  g.add(ball(0.42, P.leafD, 0,cy-0.06,0));                      // core (darkest, big facets)
  g.add(ball(0.30, P.leaf,  -0.20,cy+0.04,0.08));             // mid lobe
  g.add(ball(0.27, P.leaf,   0.22,cy+0.0,-0.10));            // mid lobe
  g.add(ball(0.30, P.leafL,  0.0,cy+0.30,0.04));             // big top highlight lobe (clear value step)
  g.add(ball(0.11, P.apple, -0.30,cy-0.06,0.24));             // one red fruit (accent)
  g.add(ball(0.11, P.apple,  0.28,cy+0.16,0.18));
  return g;
}

// ─── low bush: clustered faceted balls on a short skirt ───────────────────────
export function bush(){
  const g=new THREE.Group();
  g.add(ball(0.34, P.leafD, 0,0.26,0));                        // dark base mass
  g.add(ball(0.24, P.leaf, -0.26,0.30,0.06));
  g.add(ball(0.24, P.leaf,  0.26,0.24,-0.06));
  g.add(ball(0.27, P.leafL, 0.02,0.50,0.04));                 // big top highlight (clear value step)
  g.add(ball(0.13, P.petal, -0.22,0.44,0.22));                // blooms — the ONE accent (≥1 voxel)
  g.add(ball(0.13, P.petal,  0.24,0.42,0.18));
  g.add(ball(0.12, P.petal,  0.02,0.22,0.32));
  return g;
}

// ─── flower: stem + 4 petals around a center disc ─────────────────────────────
export function flower(){
  const g=new THREE.Group();
  g.add(cyl(0.055,0.065,0.62,6, P.leafD, 0,0.31,0));           // stem (thicker, ≥1 voxel)
  g.add(box(0.14,0.06,0.22, P.leaf, 0.13,0.34,0));            // leaf
  g.add(box(0.14,0.06,0.22, P.leaf,-0.13,0.22,0));
  const fy=0.66;
  for(let i=0;i<4;i++){ const a=i*Math.PI/2;
    g.add(box(0.20,0.07,0.12, P.petal, Math.cos(a)*0.16, fy, Math.sin(a)*0.16)); } // petals (accent)
  g.add(cyl(0.10,0.10,0.09,7, P.gold, 0,fy,0));               // center disc
  return g;
}

// ─── mushroom cluster: rounded cap + spots, on a fat stem ─────────────────────
export function mushroom(){
  const g=new THREE.Group();
  g.add(cyl(0.13,0.16,0.30,7, P.cream, 0,0.15,0));            // big stem
  g.add(cone(0.36,0.30,6, P.red, 0,0.45,0));                  // cap — 6-seg = crisp facets (accent)
  g.add(cyl(0.36,0.36,0.05,6, P.red, 0,0.31,0));             // cap underbrim (matches 6 facets)
  // bold spots on cap facets, ≥1 voxel flat quads
  for(let i=0;i<3;i++){ const a=i*2.1+0.4;
    g.add(box(0.11,0.04,0.11, P.white, Math.cos(a)*0.17,0.46,Math.sin(a)*0.17)); }
  g.add(box(0.12,0.04,0.12, P.white, 0,0.58,0));             // top spot
  // small companion mushroom — MUTED sibling so the red cap stays the one accent
  g.add(cyl(0.07,0.09,0.16,6, P.cream, 0.26,0.08,0.10));
  g.add(cone(0.19,0.17,6, darken(P.red,0.62), 0.26,0.23,0.10));
  return g;
}

// ─── rock cluster: 3 faceted angular chunks (muted stone, no accent) ──────────
export function rock(){
  const g=new THREE.Group();
  g.add(ball(0.34, P.stone,  0,0.18,0, 0));                   // main, lit (detail 0 = chunky facets)
  g.add(ball(0.22, P.stoneD,-0.28,0.12,0.10));               // mid value
  g.add(ball(0.18, darken(P.stoneD,0.7), 0.26,0.10,-0.08));  // darkest chunk (clear value spread)
  // moss collar — small faceted green nubs hugging the base, not a flat patch
  g.add(ball(0.12, P.leafD, -0.18,0.04,0.20));
  g.add(ball(0.13, P.leaf,   0.16,0.03,0.18));
  g.add(ball(0.11, P.leafD,  0.30,0.04,-0.02));
  return g;
}

// ─── potted plant: teal family-accent pot + leafy fan (ties nature to the set) ─
export function pottedPlant(){
  const g=new THREE.Group();
  g.add(cyl(0.22,0.16,0.34,6, P.accent, 0,0.17,0));          // pot (family accent, 6-seg crisp)
  g.add(cyl(0.25,0.25,0.06,6, P.accent, 0,0.36,0));         // pot rim
  g.add(cyl(0.23,0.23,0.04,6, P.woodD, 0,0.37,0));         // soil
  // faceted foliage cluster — bigger so it reads as the identifying feature (muted greens)
  g.add(ball(0.30, P.leafD, 0,0.60,0));                     // base mass
  g.add(ball(0.23, P.leaf, -0.20,0.68,0.08));
  g.add(ball(0.23, P.leaf,  0.20,0.66,-0.06));
  g.add(ball(0.22, P.leafL, 0.02,0.88,0.04));               // big top highlight
  g.add(ball(0.12, P.petal, 0.16,0.82,0.16));              // bloom accent (≥1 voxel)
  return g;
}

export const PLANTS = { pine, roundTree, bush, flower, mushroom, rock, pottedPlant };
