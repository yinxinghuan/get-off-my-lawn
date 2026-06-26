// goods.js — grocery SKU builders (material assets, category=goods).
// The retail product set from the Shelf-It store: a dozen distinct little
// voxel SKUs (bottle, can, bag, box, fruit, ice-cream, carton, veg, soda,
// + the After-Dark trio blood/meat/brain). All geometry from shared prims,
// each kind reads at thumbnail scale from its silhouette alone. Reusable by
// any shop / market / kitchen scene — drop onto a shelf, into a bin, a cart.
import * as THREE from 'three';
import { P, box, cyl, ball, cone, wedge, darken } from '../lib/prims.js';

function finish(g){ g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); return g; }

// ── the core factory: one geometry per kind, tinted by `col` ──────────────────
// kept as a single switch so a fixture can stock any SKU by (kind, col) the way
// the game does; the named builders below wrap it with representative colours.
export function product(kind, col){
  const g = new THREE.Group();
  if(kind===0){ g.add(cyl(0.13,0.15,0.46,8, col, 0,0.23,0)); g.add(cyl(0.07,0.07,0.12,8, darken(col,0.7), 0,0.52,0)); }                       // bottle
  else if(kind===1){ g.add(cyl(0.15,0.15,0.34,10, col, 0,0.17,0)); g.add(cyl(0.155,0.155,0.04,10, darken(col,0.75),0,0.36,0)); }              // can
  else if(kind===2){ g.add(box(0.30,0.42,0.12, col, 0,0.21,0)); g.add(box(0.30,0.06,0.13, darken(col,0.7),0,0.42,0)); }                       // snack bag
  else if(kind===3){ g.add(box(0.34,0.30,0.30, col, 0,0.15,0)); g.add(box(0.34,0.05,0.30, darken(col,0.7),0,0.30,0)); }                       // box (noodle/instant)
  else if(kind===4){ [[-0.1,0.12,0],[0.1,0.11,0.03],[0,0.24,-0.06]].forEach(([x,y,z])=>g.add(ball(0.12,col,x,y,z,0))); }                      // fruit pile
  else if(kind===5){ const wf=cone(0.12,0.34,8, P.woodL, 0,0.17,0); wf.rotation.x=Math.PI; g.add(wf); g.add(ball(0.15,col,0,0.40,0,0)); g.add(ball(0.07,P.white,0,0.52,0,0)); } // ice-cream cone + scoop
  else if(kind===6){ g.add(box(0.26,0.40,0.26, col, 0,0.20,0)); const top=wedge(0.26,0.12,0.26, darken(col,0.82), 0,0.46,0); g.add(top); }     // milk/yogurt carton (gable top)
  else if(kind===8){                                                                          // aluminium pull-tab drink can — taller + slimmer than the food can
    g.add(cyl(0.12,0.12,0.46,12, col, 0,0.23,0));                                             // tall slim body
    g.add(cyl(0.125,0.125,0.05,12, darken(col,0.62), 0,0.465,0));                             // darker top rim collar
    g.add(cyl(0.10,0.10,0.02, 8, darken(col,0.40), -0.025,0.498,0));                          // pull-tab indent disc (off-centre)
  }
  else if(kind===9){                                                                          // blood bag (IV pouch)
    g.add(box(0.26,0.40,0.10, col, 0,0.22,0));                                                // flat plasma pouch
    g.add(box(0.27,0.06,0.11, darken(col,0.6), 0,0.40,0));                                    // top seal band
    g.add(box(0.16,0.10,0.105, P.cream, 0,0.20,0.005));                                       // white label
    g.add(cyl(0.018,0.018,0.10,6, darken(col,0.6), 0,0.04,0));                                // outlet drip tube
  }
  else if(kind===10){                                                                         // raw meat slab + bone
    g.add(box(0.34,0.12,0.26, col, 0,0.10,0));                                                // fleshy slab
    g.add(box(0.34,0.05,0.26, darken(col,0.8), 0,0.165,0));                                   // darker top (seared/fat cap)
    g.add(cyl(0.05,0.05,0.10,8, P.cream, 0.14,0.10,0, {r:0.5}));                              // round bone poking out the side
  }
  else if(kind===11){                                                                         // brain (two wrinkly lobes)
    g.add(ball(0.15,col,-0.07,0.16,0,0)); g.add(ball(0.15,col,0.07,0.16,0,0));                // two hemispheres
    g.add(ball(0.11,col,0,0.24,-0.04,0));                                                     // crown bump
    g.add(box(0.012,0.20,0.20, darken(col,0.7), 0,0.18,0));                                   // central fissure
  }
  else { g.add(box(0.10,0.32,0.10, darken(col,0.85), -0.09,0.16,0)); g.add(ball(0.13,col,-0.09,0.34,0,0)); g.add(box(0.10,0.28,0.10, darken(col,0.85), 0.10,0.14,0.03)); g.add(ball(0.12,col,0.10,0.30,0.03,0)); } // leafy veg bunch (kind 7)
  return g;
}

// ── named SKUs with representative colours (so each reads on its own in the lab) ──
const bottle   = () => finish(product(0,  P.purple));    // liquor / glass bottle
const can      = () => finish(product(1,  P.red));       // canned food
const snackBag = () => finish(product(2,  P.orange));    // chip / snack pouch
const boxPack  = () => finish(product(3,  P.gold));      // instant noodle / boxed goods
const fruitPile= () => finish(product(4,  P.apple));     // loose fruit pile
const iceCream = () => finish(product(5,  P.petal));     // cone + scoop
const carton   = () => finish(product(6,  P.cream));     // gable-top milk / yogurt
const leafyVeg = () => finish(product(7,  P.leafL));     // leafy greens bunch
const sodaCan  = () => finish(product(8,  P.coldGlow));  // tall slim pull-tab soda
const bloodBag = () => finish(product(9,  0x9e1414));    // After Dark — IV plasma pouch
const meatSlab = () => finish(product(10, 0xb24a55));    // After Dark — raw meat + bone
const brain    = () => finish(product(11, 0xd98aa0));    // After Dark — brain

export const GOODS = { bottle, can, snackBag, boxPack, fruitPile, iceCream, carton, leafyVeg, sodaCan, bloodBag, meatSlab, brain };
