// Landscape framing for the Crazy Games guest build only.
// The AlterU host build never takes this path (isCrazyGamesBuild is false).

import { isCrazyGamesBuild } from '@shared/runtime';

/** World-space corners of the cemetery the camera should fill. */
export const YARD_FRAME: [number, number][] = [
  [-4.8, -5.6], [4.8, -5.6], [4.8, 4.2], [-4.8, 4.2],
];
/** Path corners that must stay clear of the side rails during a fight. */
export const LANE_FRAME: [number, number][] = [
  [-3.8, -5.0], [3.2, -5.0], [3.2, -2.4], [-3.2, -2.4],
  [-3.2, 0.2], [3.2, 0.2], [3.2, 2.8], [0.0, 3.6],
];

export interface DeskRails { left: number; right: number; }

/** Side columns, in CSS pixels. Narrower on a 907-wide iframe so the lane still fits. */
export function deskRails(width: number): DeskRails {
  if (width < 1100) return { left: 150, right: 172 };
  if (width < 1600) return { left: 196, right: 216 };
  return { left: 228, right: 252 };
}

/**
 * Guest build in a landscape iframe (Crazy Games desktop).
 * Portrait guests, and every host build, keep the phone layout.
 */
export function isGuestDesk(w = window.innerWidth, h = window.innerHeight): boolean {
  if (!isCrazyGamesBuild) return false;
  return w > h && w >= 800 && h >= 420;
}
