// props.js —物品/道具 builders (material assets, category=prop).
// Retail-themed sample set; theme is incidental — these validate the prop pipeline.
// All geometry from the shared prims; one family accent (P.accent teal) throughout.
import * as THREE from 'three';
import { P, M, box, cyl, ball, wedge, darken } from '../lib/prims.js';

// a small product (box or can) for stocking shelves / coolers
function product(x,y,z, c, kind){
  if(kind==='can') return cyl(0.07,0.07,0.20,8, c, x,y+0.10,z, {r:0.5});
  return box(0.15,0.20,0.13, c, x,y+0.10,z);
}

// ─── shelf (gondola): back panel + colored kick-plate + 3 stocked shelves ─────
export function shelf(){
  const g=new THREE.Group(); const W=1.04, H=1.30, D=0.42;
  g.add(box(W,0.10,D, P.panelD, 0,0.05,0));                 // base
  g.add(box(W,0.14,D+0.02, P.accent, 0,0.07,0));            // colored kick-plate (value break)
  g.add(box(W,H,0.05, P.panel, 0,H/2,-D/2+0.02));           // back panel
  g.add(box(W-0.10,H*0.92,0.02, P.accent, 0,H/2,-D/2+0.05, {r:0.6})); // back accent inlay
  for(const sx of [-1,1]) g.add(box(0.05,H,D, P.panelD, sx*(W/2-0.03),H/2,0)); // sides
  g.add(box(W,0.06,D, P.accent, 0,H,0));                    // top cap (accent)
  const levels=[0.30,0.66,1.02];
  const prods=[P.red,P.orange,P.green,P.blue,P.purple,P.coral];
  levels.forEach((ly,li)=>{
    g.add(box(W-0.08,0.04,D-0.06, P.panelD, 0,ly,0.02));    // shelf plank
    for(let i=0;i<5;i++){
      const px=-0.36+i*0.18, c=prods[(li*5+i)%prods.length];
      g.add(((li+i)%3===0) ? product(px,ly+0.02,0.06,c,'can') : product(px,ly+0.02,0.06,c,'box'));
    }
  });
  g.add(box(W-0.2,0.07,0.02, P.gold, 0,0.43,D/2+0.02));     // price strip
  return g;
}

// ─── open chest freezer: white body + cold-blue recessed well + glass lid ─────
export function freezer(){
  const g=new THREE.Group(); const W=0.94,H=0.58,D=0.64;
  g.add(box(W,H,D, P.white, 0,H/2,0));                       // body
  g.add(box(W+0.05,0.10,D+0.05, P.panelD, 0,H,0));          // chunky top rim
  g.add(box(W-0.14,0.14,D-0.14, P.slate, 0,H-0.05,0));      // dark recessed well walls
  g.add(box(W-0.18,0.04,D-0.18, P.coldGlow, 0,H-0.10,0, {e:P.coldGlow, ei:0.7})); // cold glow floor
  const cols=[P.red,P.orange,P.blue,P.green]; let k=0;
  for(let ix=-1;ix<=1;ix++) for(let iz=-1;iz<=1;iz++){
    if((ix+iz)===2) continue;                               // drop a corner → less mechanical
    g.add(box(0.15,0.18,0.12, cols[(k++)%cols.length], ix*0.24+(iz%2)*0.03, H-0.02, iz*0.17));
  }
  g.add(box(W-0.12,0.02,D*0.46, P.glass, 0,H+0.10,D*0.20, {o:0.34, r:0.2})); // glass lid
  g.add(box(W*0.7,0.12,0.02, P.blue, 0,0.18,D/2+0.005));     // front signage strip
  for(const sx of [-1,1]) g.add(box(0.07,0.18,0.07, P.steel, sx*(W/2-0.08),0.09,D/2-0.07)); // feet
  return g;
}

// ─── checkout counter: light body + conveyor strip + tilted register screen ───
export function checkout(){
  const g=new THREE.Group(); const W=1.0,H=0.58,D=0.56;
  g.add(box(W,H,D, P.white, 0,H/2,0));                       // body
  g.add(box(W+0.05,0.07,D+0.05, P.panelD, 0,H,0));          // top edge
  g.add(box(0.40,0.04,D-0.14, P.accent, 0.22,H+0.04,0));    // conveyor belt
  for(let i=0;i<5;i++) g.add(box(0.40,0.05,0.03, P.panelD, 0.22,H+0.05,-D/2+0.12+i*0.09)); // slats
  g.add(box(0.34,0.18,0.28, P.slate, -0.28,H+0.11,-0.02));  // register base
  g.add(box(0.30,0.26,0.05, 0x2c3036, -0.28,H+0.32,-0.12)); // screen bezel
  g.add(box(0.25,0.21,0.02, P.coldGlow, -0.28,H+0.33,-0.085, {e:P.coldGlow, ei:0.7})); // screen
  for(let i=0;i<3;i++) for(let j=0;j<2;j++)                  // keypad
    g.add(box(0.05,0.035,0.05, P.panel, -0.38+i*0.08, H+0.21, 0.04+j*0.07));
  g.add(box(W*0.82,0.12,0.02, P.green, 0,0.22,D/2+0.005));   // front accent panel
  return g;
}

// ─── produce stand: wood crate + faceted fruit nestled in the rim ─────────────
export function produce(){
  const g=new THREE.Group(); const W=0.78,D=0.52;
  g.add(box(W,0.30,D, P.woodL, 0,0.15,0));                   // crate body
  for(const sx of [-1,1]) g.add(box(0.05,0.30,D, P.woodD, sx*(W/2-0.02),0.15,0)); // rails
  g.add(box(W,0.06,D, P.woodD, 0,0.03,0));                   // bottom rail
  g.add(box(W-0.06,0.05,D-0.06, P.woodM, 0,0.28,0));         // inner bed
  const fr=[P.apple,P.fruitO,P.lime];
  for(let r=0;r<3;r++) for(let c=0;c<4;c++)
    g.add(ball(0.085, fr[(r+c)%fr.length], -0.27+c*0.18,0.33,-0.16+r*0.16));
  g.add(box(0.40,0.14,0.02, P.green, 0,0.18,D/2+0.005));     // front label
  g.add(box(0.30,0.08,0.03, P.cream, 0,0.18,D/2+0.01));
  return g;
}

// ─── shopping basket: open box + bold arched handle + groceries ───────────────
export function basket(){
  const g=new THREE.Group(); const W=0.50,H=0.26,D=0.36;
  g.add(box(W,H,D, P.red, 0,H/2,0));                         // body
  g.add(box(W-0.08,H-0.06,D-0.08, 0x9c2f26, 0,H/2+0.02,0));  // inner well
  g.add(box(W+0.03,0.05,D+0.03, 0xb53a2f, 0,H,0));           // rim
  for(const sx of [-1,1]) g.add(box(0.06,0.30,0.06, P.slate, sx*(W/2-0.07),H+0.15,0)); // handle posts
  g.add(box(W-0.06,0.06,0.06, P.slate, 0,H+0.30,0));         // handle bar
  g.add(ball(0.10, P.apple, -0.10,H+0.06,0.04));
  g.add(ball(0.10, P.fruitO, 0.08,H+0.06,-0.05));
  g.add(box(0.13,0.18,0.11, P.blue, 0.02,H+0.05,0.10));
  return g;
}

// ─── aisle sign: chunky 2-step base + thick pole + double-sided number board ───
export function aisleSign(){
  const g=new THREE.Group();
  g.add(cyl(0.22,0.26,0.07,8, P.slate, 0,0.035,0));         // base step 1
  g.add(cyl(0.15,0.18,0.07,8, P.panelD,0,0.10,0));          // base step 2
  g.add(box(0.12,1.04,0.12, P.steel, 0,0.62,0));            // thick pole
  g.add(box(0.50,0.44,0.12, P.accent, 0,1.20,0));           // board
  g.add(box(0.50,0.44,0.02, P.white, 0,1.20,0.065));        // face
  g.add(box(0.50,0.44,0.02, P.white, 0,1.20,-0.065));       // back
  g.add(box(0.18,0.26,0.03, P.slate, 0,1.20,0.08));         // number glyph
  g.add(box(0.34,0.06,0.02, P.gold, 0,1.42,0.08));          // top accent bar
  return g;
}

// ─── snack rack: tall impulse floor stand + teal top rail + 3 stocked tiers ────
export function snackRack(){
  const g=new THREE.Group(); const W=0.56, D=0.34, H=1.02;
  g.add(box(W+0.04,0.06,D+0.04, darken(P.woodD,0.85), 0,0.04,0));        // base
  g.add(box(W,H,D, P.woodM, 0,0.04+H/2,0));                             // body
  g.add(box(W+0.06,0.06,D+0.04, P.accent, 0,0.04+H+0.02,0));            // teal top rail (accent)
  const cols=[P.red,P.orange,P.gold,P.petal,P.blue,P.green];
  const tiers=3, n=4;
  for(let t=0;t<tiers;t++){
    const y=0.26+t*0.30;
    g.add(box(W-0.04,0.025,D, darken(P.woodD,0.9), 0, y-0.105, 0));      // shelf board
    for(let i=0;i<n;i++) g.add(box(0.105,0.17,0.085, cols[(t*n+i)%cols.length], -0.18+i*0.12, y, D/2-0.03)); // product boxes face +z
  }
  return g;
}

// ─── coffee vending machine: tall floor unit, teal header cap + opaque window ──
export function coffeeMachine(){
  const g=new THREE.Group(); const bw=0.72, bd=0.54, bh=1.46, fz=bd/2;
  g.add(box(bw+0.06,0.10,bd+0.06, darken(P.ironD,0.8), 0,0.05,0));          // base plinth
  g.add(box(bw,bh,bd, P.panelD, 0,0.05+bh/2,0));                           // dark body
  g.add(box(bw+0.05,0.28,bd+0.04, darken(P.accent,0.7), 0, 0.05+bh-0.10, 0)); // teal header CAP (proud top so it doesn't z-fight the body top)
  g.add(box(bw,0.14,0.03, P.accent, 0, 0.05+bh-0.12, fz+0.02));           // bright teal face strip
  const winY=0.05+bh*0.66, winW=0.52, winH=0.50;
  g.add(box(winW,winH,0.02, darken(P.slate,0.8), 0, winY, fz+0.02));      // dark display backing (opaque)
  for(let r=0;r<2;r++){
    g.add(box(winW-0.04,0.025,0.04, darken(P.woodD,0.9), 0, winY-0.19+r*0.21, fz+0.06)); // shelf ledge
    for(let i=-1;i<=1;i++) g.add(cyl(0.05,0.045,0.10,8, P.cream, i*0.16, winY-0.12+r*0.21, fz+0.09)); // cups
  }
  const fzF=fz+0.06, hw=winW/2+0.03, hh=winH/2+0.03, tb=0.05;             // steel window frame (4 bars)
  g.add(box(winW+0.10,tb,0.03, P.steel, 0, winY+hh, fzF)); g.add(box(winW+0.10,tb,0.03, P.steel, 0, winY-hh, fzF));
  g.add(box(tb,winH+0.06,0.03, P.steel, -hw, winY, fzF)); g.add(box(tb,winH+0.06,0.03, P.steel, hw, winY, fzF));
  const px=0.17, py=0.05+bh*0.40;
  g.add(box(0.22,0.32,0.03, P.ironM, px, py, fz+0.02));                   // selection button panel
  for(let b=0;b<3;b++) g.add(box(0.07,0.07,0.03, P.accent, px, py+0.10-b*0.10, fz+0.06)); // buttons proud
  g.add(box(0.42,0.20,0.03, darken(P.ironD,0.6), -0.06, 0.05+bh*0.16, fz+0.02)); // dispense panel
  g.add(box(0.42,0.04,0.05, P.steel, -0.06, 0.05+bh*0.16+0.11, fz+0.04)); // slot lip
  return g;
}

export const PROPS = { shelf, freezer, checkout, produce, basket, aisleSign, snackRack, coffeeMachine };
