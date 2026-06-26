// animals.js — 人/动物 builders (material assets, category=animals).
// Chibi cubic quadrupeds + biped chicken + squat frog. One visual language: the
// shared flat-shaded box prim. Animal fur/skin colors are builder-local identity
// colors (kept as literals here, like props.js's one-off shades); structural greys
// and accents still come from P. See DESIGN_SYSTEM.md for proportions + the triad.
import { box } from '../lib/prims.js';
import * as THREE from 'three';

// ─── generic chunky quadruped ───────────────────────────────────────────────
// body length along X (head at +X, tail at -X), width along Z.
// chibi/cubic defaults: compact body, stub legs, big front-heavy head (Crossy charm).
export function quadruped(s){
  const g = new THREE.Group();
  const BL=s.bl??1.10, BH=s.bh??0.84, BW=s.bw??0.92;
  const legH=s.legH??0.24, legW=s.legW??0.28, hoofH=0.10;
  const bodyY = legH + BH/2;
  g.add(box(BL, BH, BW, s.body, 0, bodyY, 0));
  if(s.back) g.add(box(BL*0.7, 0.14, BW*0.7, s.back, -BL*0.05, bodyY+BH/2+0.05, 0)); // saddle/patch strip
  if(s.patches) s.patches.forEach(p=> g.add(box(p.s,0.04,p.s, p.c, p.x, bodyY+BH/2, p.z)));
  // dark stripes across the back (cat) — thin bars just proud of the top plane
  if(s.stripes){ const st=s.stripes; const n=st.n??3;
    for(let i=0;i<n;i++){ const px=BL*0.30 - i*(st.gap??0.26);
      g.add(box(st.w??0.08, 0.05, BW*0.82, st.c??0x2c2622, px, bodyY+BH/2, 0)); }
  }
  // white chest blaze on the FRONT (+X) face — the signature front-facing motif
  if(s.chest){ const c=s.chest;
    g.add(box(0.05, c.h??0.42, c.w??0.40, c.c??0xf4ead8, BL/2+0.005, bodyY-(c.dy??0.06), 0)); }

  // 4 legs at corners + darker hoof tips
  const lx = BL/2 - legW/2 - 0.04, lz = BW/2 - legW/2 - 0.03;
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    g.add(box(legW, legH, legW, s.leg??s.body, sx*lx, legH/2, sz*lz));
    g.add(box(legW+0.012, hoofH, legW+0.012, s.hoof??0x2c2622, sx*lx, hoofH/2, sz*lz));
  }

  // head at front (+X) — big + overlapping the body (front-heavy chibi)
  const HW=s.hw??0.80, HH=s.hh??0.76, HD=s.hd??0.80;
  const headX = BL/2 + HW/2 - (s.headInset??0.22);
  const headY = bodyY + (s.headDy??0.16);
  g.add(box(HW, HH, HD, s.head??s.body, headX, headY, 0));
  // snout / muzzle protruding further +X
  if(s.snout){
    const sw=s.snout.w??0.30, sh=s.snout.h??0.30, sd=s.snout.d??0.46;
    g.add(box(sw, sh, sd, s.snout.c??s.head??s.body, headX+HW/2+sw/2-0.02, headY+(s.snout.dy??-0.10), 0));
    if(s.snout.nostril){
      g.add(box(0.05,0.06,0.08, 0x2c2622, headX+HW/2+sw-0.02, headY+(s.snout.dy??-0.10), -0.10));
      g.add(box(0.05,0.06,0.08, 0x2c2622, headX+HW/2+sw-0.02, headY+(s.snout.dy??-0.10),  0.10));
    }
  }
  // ears
  if(s.ears){
    const e=s.ears; const ey=headY+HH/2+ (e.dy??0.02);
    for(const sz of [-1,1]){
      if(e.type==='round'){
        g.add(box(e.w??0.16,e.h??0.16,e.t??0.14, e.c??s.head??s.body, headX+(e.dx??0.0), ey, sz*(HD/2-0.08)));
      } else {
        const ew=e.w??0.13, eh=e.h??0.22, et=e.t??0.10, ez=sz*(HD/2-0.10);
        g.add(box(ew,eh,et, e.c??s.head??s.body, headX+(e.dx??0.0), ey+0.04, ez));
        if(e.inner) g.add(box(ew*0.6, eh*0.6, 0.04, e.inner, headX+(e.dx??0.0)+0.02, ey+0.04, ez));
        if(e.tip)   g.add(box(ew+0.012, eh*0.34, et+0.012, e.tip, headX+(e.dx??0.0), ey+0.04+eh/2-eh*0.17, ez)); // dark ear tip (fox)
      }
    }
  }
  // horns
  if(s.horns){ const hc=s.horns;
    for(const sz of [-1,1]) g.add(box(hc.w??0.10, hc.h??0.20, hc.w??0.10, hc.c??0xe8dcc0, headX+(hc.dx??0.06), headY+HH/2+0.10, sz*(HD/2-0.12)));
  }
  // eyes on the +X (front) face
  const ez = s.eyeZ ?? HD*0.26, ex = headX+HW/2+0.005, eyeY = headY+(s.eyeDy??0.06);
  g.add(box(0.10,0.13,0.03, 0x241f1c, ex, eyeY, -ez));
  g.add(box(0.10,0.13,0.03, 0x241f1c, ex, eyeY,  ez));
  // tail
  if(s.tail){ const t=s.tail;
    if(t.type==='bushy'){
      const tw=t.w??0.24, th=t.h??0.30, tl=t.l??0.34;
      const tz = t.z??(BW*0.18);
      g.add(box(tl, th, tw, t.c??s.body, -BL/2-tl/2+0.04, bodyY+(t.dy??0.06), tz));
      if(t.tip) g.add(box(tw*0.9, th*0.92, tw*0.9, t.tip, -BL/2-tl+0.10, bodyY+(t.dy??0.06), tz)); // white tip block
    } else if(t.type==='upright'){
      const shaftH=t.h??0.46;
      g.add(box(0.13, shaftH, 0.13, t.c??s.body, -BL/2-0.02, bodyY+shaftH/2, 0));
      g.add(box(0.13, 0.13, 0.20, t.c??s.body, -BL/2-0.02, bodyY+shaftH, 0.06));
      if(t.tip) g.add(box(0.135,0.135,0.135, t.tip, -BL/2-0.02, bodyY+shaftH, 0.14));
    } else {
      g.add(box(0.10,0.10,0.10, t.c??s.body, -BL/2-0.05, bodyY+(t.dy??0.12), 0));
    }
  }
  return g;
}

// ─── chicken (biped) ────────────────────────────────────────────────────────
export function chicken(){
  const g=new THREE.Group();
  const legH=0.30, bodyY=legH+0.34;
  g.add(box(0.66,0.60,0.64, 0xf6f1e8, 0, bodyY, 0));            // body (fatter + lower)
  g.add(box(0.32,0.32,0.42, 0xf6f1e8, 0.40, bodyY+0.20, 0));    // head/neck block
  g.add(box(0.20,0.13,0.18, 0xf2a23a, 0.62, bodyY+0.16, 0));    // beak (≥1 voxel, proud)
  // red comb — 3 bumps along the head crown (the ONE accent, reads at thumbnail)
  for(let i=0;i<3;i++) g.add(box(0.11,0.13+ (i===1?0.06:0),0.12, 0xe23b2e, 0.30+i*0.10, bodyY+0.44, 0));
  g.add(box(0.10,0.16,0.10, 0xe23b2e, 0.54, bodyY+0.02, 0));    // wattle
  for(const sz of [-1,1]) g.add(box(0.10,0.40,0.34, 0xeee8de, sz*0, bodyY, sz*0.32)); // wings
  g.add(box(0.30,0.30,0.10, 0xeae3d6, -0.34, bodyY+0.20, 0));   // tail feathers
  for(const sz of [-1,1]){
    g.add(box(0.08,legH,0.08, 0xf2a23a, 0.06, legH/2, sz*0.14));
    g.add(box(0.16,0.06,0.16, 0xf2a23a, 0.10, 0.03, sz*0.14));  // foot
  }
  g.add(box(0.07,0.10,0.03, 0x241f1c, 0.55, bodyY+0.20, -0.12));
  g.add(box(0.07,0.10,0.03, 0x241f1c, 0.55, bodyY+0.20,  0.12));
  return g;
}

// ─── frog (squat) ───────────────────────────────────────────────────────────
export function frog(){
  const g=new THREE.Group();
  const bodyY=0.30;
  g.add(box(1.0,0.50,0.92, 0x5fbf4f, 0, bodyY, 0));             // wide body
  g.add(box(0.84,0.16,0.84, 0xeef3df, 0, 0.12, 0.04));         // pale belly base
  for(const sz of [-1,1]){                                       // folded back legs
    g.add(box(0.20,0.22,0.40, 0x4fae44, 0.10, 0.16, sz*0.50));
    g.add(box(0.30,0.14,0.16, 0x4fae44, 0.34, 0.07, sz*0.42));  // foot
  }
  for(const sz of [-1,1]) g.add(box(0.14,0.18,0.14, 0x4fae44, 0.46, 0.12, sz*0.16)); // front arms
  for(const sz of [-1,1]){                                       // big bulging eyes proud on top (the frog cue)
    g.add(box(0.30,0.30,0.30, 0x6fce5c, 0.18, bodyY+0.32, sz*0.28));
    g.add(box(0.13,0.15,0.13, 0x241f1c, 0.33, bodyY+0.34, sz*0.28));
  }
  g.add(box(0.50,0.04,0.06, 0x2f7a2a, 0.42, bodyY-0.14, 0));    // mouth line
  return g;
}

// ─── duck (biped) — plump yellow body + flat orange bill ─────────────────────
export function duck(){
  const g=new THREE.Group();
  const legH=0.22, bodyY=legH+0.30;
  g.add(box(0.66,0.52,0.60, 0xf2d23a, 0, bodyY, 0));            // plump yellow body
  g.add(box(0.30,0.34,0.36, 0xf2d23a, 0.34, bodyY+0.26, 0));    // head/neck
  g.add(box(0.26,0.10,0.20, 0xf28a2a, 0.56, bodyY+0.18, 0));    // flat orange bill (the duck cue)
  g.add(box(0.30,0.26,0.10, 0xf6dd6a, -0.34, bodyY+0.08, 0));   // up-tilted tail
  for(const sz of [-1,1]) g.add(box(0.10,0.34,0.30, 0xe9c52f, 0, bodyY, sz*0.32)); // wings
  for(const sz of [-1,1]){
    g.add(box(0.08,legH,0.08, 0xf28a2a, 0.04, legH/2, sz*0.14));
    g.add(box(0.20,0.05,0.18, 0xf28a2a, 0.10, 0.025, sz*0.14)); // webbed foot
  }
  g.add(box(0.06,0.09,0.03, 0x241f1c, 0.49, bodyY+0.30, -0.11));
  g.add(box(0.06,0.09,0.03, 0x241f1c, 0.49, bodyY+0.30,  0.11));
  return g;
}

// ─── roster (make + Crossy-Road tile color + name) ──────────────────────────
export const ANIMALS = {
  pig: { tile:0x4db6e8, make:()=>quadruped({ body:0xf2a6c0, leg:0xf2a6c0, head:0xf2a6c0,
      snout:{c:0xd96f93, nostril:true, w:0.34,h:0.34,d:0.48, dy:-0.07},   // proud saturated snout = the one accent
      ears:{type:'round', c:0xe98aa9, inner:0xd96f93, w:0.22,h:0.24,t:0.12, dy:0.0},
      tail:{type:'curl', c:0xe98aa9, dy:0.12},
      bl:1.12,bh:0.86,bw:0.92 }) },

  cow: { tile:0x53c25b, make:()=>quadruped({ body:0xf3efe7, leg:0xf3efe7, head:0xf3efe7,
      patches:[{s:0.46,c:0x4a3526,x:-0.16,z:0.12},{s:0.36,c:0x4a3526,x:0.30,z:-0.16}], // fewer, chunkier blobs
      snout:{c:0xf3b2c2, nostril:true, w:0.32,h:0.30,d:0.42, dy:-0.10},    // pink muzzle accent
      ears:{type:'round', c:0xf3efe7, w:0.18,h:0.16,t:0.13},
      horns:{c:0xf0e8d0,h:0.28,w:0.12}, tail:{type:'curl', c:0x4a3526},   // longer, bone-light horns break silhouette
      hoof:0x2c2622, bl:1.30,bh:0.88,bw:0.96 }) },

  // CAT — compact gray tabby: TALL triangle ears (the #1 cat cue), white chest, upright curled tail, dark stripes
  cat: { tile:0xff7a4d, make:()=>quadruped({ body:0x9aa1a8, leg:0x9aa1a8, head:0x9aa1a8,
      snout:{c:0xe9eef2, w:0.20,h:0.18,d:0.24, dy:-0.10},
      chest:{c:0xf0f3f5, h:0.40, w:0.34, dy:0.04},
      stripes:{c:0x4f565c, n:3, gap:0.24, w:0.10},                        // ≥1-voxel tabby bars
      ears:{type:'point', c:0x9aa1a8, inner:0xf0c4cf, w:0.16,h:0.34,t:0.12},
      tail:{type:'upright', c:0x9aa1a8, h:0.52, tip:0xf0f3f5},
      headDy:0.18, hw:0.76,hh:0.74,hd:0.78,
      bl:1.02,bh:0.74,bw:0.78, legH:0.22, hoof:0x4f565c }) },

  // FOX — long + low: orange, white blaze, white-tipped bushy tail, TALL black-tipped ears + socks
  fox: { tile:0x2fb8c4, make:()=>quadruped({ body:0xef7d2e, leg:0xef7d2e, head:0xef7d2e,
      snout:{c:0x2c2622, w:0.18,h:0.15,d:0.30, dy:-0.13},
      chest:{c:0xf6ecd9, h:0.46, w:0.42, dy:0.04},
      ears:{type:'point', c:0xef7d2e, inner:0xf6ecd9, tip:0x2a2018, w:0.15,h:0.34,t:0.11},
      tail:{type:'bushy', c:0xef7d2e, tip:0xf6ecd9, w:0.30,h:0.36,l:0.50, z:0.16},
      headDy:0.14, hw:0.72,hh:0.66,hd:0.74,
      bl:1.24,bh:0.70,bw:0.76, legH:0.24, hoof:0x2a2018 }) },

  chicken: { tile:0xff5d8f, make:chicken },
  frog:    { tile:0xc44ddd, make:frog },

  // DOG — brown, floppy ears, white chest, white-tip upright tail, dark nose
  dog: { tile:0xf2c14e, make:()=>quadruped({ body:0xb5793f, leg:0xb5793f, head:0xb5793f,
      snout:{c:0x2c2622, w:0.22,h:0.20,d:0.32, dy:-0.10},
      chest:{c:0xf6ecd9, h:0.34, w:0.30, dy:0.06},
      ears:{type:'round', c:0x7c5230, w:0.16,h:0.26,t:0.11, dy:-0.12},   // floppy hung ears
      tail:{type:'upright', c:0xb5793f, h:0.36, tip:0xf6ecd9},
      headDy:0.16, hw:0.74,hh:0.70,hd:0.76, bl:1.20,bh:0.74,bw:0.80, legH:0.26, hoof:0x2c2622 }) },

  // SHEEP — cream fluffy body, dark face + legs, fluffy back strip
  sheep: { tile:0x9fd6ff, make:()=>quadruped({ body:0xf3efe7, leg:0x44413e, head:0x3a3531,
      back:0xfbf8f2,
      snout:{c:0x3a3531, w:0.20,h:0.18,d:0.22, dy:-0.06},
      ears:{type:'round', c:0x3a3531, w:0.17,h:0.11,t:0.13, dy:-0.04},
      tail:{type:'curl', c:0xf3efe7},
      hw:0.70,hh:0.66,hd:0.74, bl:1.10,bh:0.86,bw:0.92, legH:0.24, hoof:0x2c2622 }) },

  // RABBIT — small, very TALL ears (the cue), grey-white, pink inner ear + nose
  rabbit: { tile:0xff7aa8, make:()=>quadruped({ body:0xe8e4dc, leg:0xe8e4dc, head:0xe8e4dc,
      snout:{c:0xf0c4cf, w:0.16,h:0.14,d:0.18, dy:-0.06},
      chest:{c:0xfbf8f2, h:0.30, w:0.26, dy:0.04},
      ears:{type:'point', c:0xe8e4dc, inner:0xf0c4cf, w:0.14,h:0.48,t:0.10},
      tail:{type:'curl', c:0xfbf8f2, dy:0.18},
      headDy:0.18, hw:0.70,hh:0.70,hd:0.72, bl:0.92,bh:0.70,bw:0.74, legH:0.20, hoof:0xcfcabf }) },

  // BEAR — bulky brown, round ears, tan muzzle, dark paws
  bear: { tile:0x6fc85a, make:()=>quadruped({ body:0x7c5230, leg:0x7c5230, head:0x7c5230,
      snout:{c:0xc8975c, nostril:true, w:0.30,h:0.28,d:0.34, dy:-0.08},
      ears:{type:'round', c:0x5e3d24, w:0.20,h:0.20,t:0.14, dy:0.02},
      tail:{type:'curl', c:0x5e3d24},
      hw:0.88,hh:0.84,hd:0.88, bl:1.34,bh:1.00,bw:1.06, legH:0.28, hoof:0x3a2a1a }) },

  duck: { tile:0xb05de8, make:duck },
};
