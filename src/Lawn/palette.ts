// ── Get Off My Grave — the game's own colour system ─────────────────────────
// One palette, used systematically everywhere (icons, UI, weapons) so the look
// reads as a designed set, not an emoji grab-bag.
//
// Rhythm / rules:
//   • Structural icons   = BONE body (+ BONE_D shade, INK detail)
//   • Value / life        = GOLD          (souls, score, candle flame, crown)
//   • Spectral / build    = WISP          (sockets, ghost previews, build cues)
//   • The 3 weapons       = the elemental triad EMBER / FROST / HAUNT — and each
//                           weapon keeps its ONE colour across icon → tower → shot
//   • Danger / can't-pay  = BLOOD
//
// Hex strings for SVG/CSS; the 0x… mirrors are for three.js.
export const C = {
  bone: '#e7e0cb', boneD: '#b0a98f', ink: '#161f29',
  gold: '#ffd15e', goldD: '#e8a23a',
  wisp: '#79e0ad', wispD: '#3fa877',
  ember: '#ff8a3c', frost: '#8fe0ff', haunt: '#c79bf0',
  blood: '#ff5c6b',
} as const;

export const HEX = {
  ember: 0xff8a3c, frost: 0x8fe0ff, haunt: 0xc79bf0,
  wisp: 0x79e0ad, gold: 0xffd15e,
} as const;
