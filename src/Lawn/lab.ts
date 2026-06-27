// Typed bridge to the low-poly voxel builders ported from _lowpoly_lab.
// They are plain ESM JS that return THREE.Group; we import them untyped and
// re-export thin typed factories. See src/lab/lab.d.ts for the module decl.
import * as THREE from 'three';
// @ts-ignore — JS module, untyped
import { P as _P, box as _box, cyl as _cyl, cone as _cone, ball as _ball } from '@lab/lib/prims.js';
// @ts-ignore
import * as scene from '@lab/builders/scene.js';
// @ts-ignore
import * as plants from '@lab/builders/plants.js';
// @ts-ignore
import { CHARACTERS as _CHARACTERS } from '@lab/builders/characters.js';
// @ts-ignore
import { ARCHETYPES as _ARCHETYPES } from '@lab/builders/archetypes.js';
// @ts-ignore
import { ANIMALS as _ANIMALS } from '@lab/builders/animals.js';
// @ts-ignore
import { MONSTERS as _MONSTERS } from '@lab/builders/monsters.js';
// @ts-ignore
import { MYTHIC as _MYTHIC } from '@lab/builders/mythic.js';

type Group = THREE.Group;
type Factory = () => Group;

// palette + prim helpers (for our own bespoke meshes: sprinklers, plots, water)
export const P = _P as Record<string, number>;
export const box = _box as (w: number, h: number, d: number, hex: number, x: number, y: number, z: number, opt?: any) => THREE.Mesh;
export const cyl = _cyl as (rt: number, rb: number, h: number, seg: number, hex: number, x: number, y: number, z: number, opt?: any) => THREE.Mesh;
export const cone = _cone as (r: number, h: number, seg: number, hex: number, x: number, y: number, z: number, opt?: any) => THREE.Mesh;
export const ball = _ball as (r: number, hex: number, x: number, y: number, z: number, detail?: number) => THREE.Mesh;

// scene tiles + structures
export const grassTile = scene.grassTile as Factory;
export const roadTile = scene.roadTile as Factory;
export const house = scene.house as Factory;
export const fence = scene.fence as Factory;
export const lamp = scene.lamp as Factory;

// plants
export const PLANTS = plants.PLANTS as Record<string, Factory>;

// people / intruders
export const CHARACTERS = _CHARACTERS as Record<string, Factory>;
export const ARCHETYPES = _ARCHETYPES as Record<string, Factory>;
// undead — vampire / werewolf / zombie / ghost / skeleton / mummy
export const MONSTERS = _MONSTERS as Record<string, Factory>;
// mythic — minotaur (used as a boss)
export const MYTHIC = _MYTHIC as Record<string, Factory>;
// ANIMALS is { name: { tile, make } }
export const ANIMALS = _ANIMALS as Record<string, { tile: number; make: Factory }>;

/** Walk-rig pivots exposed by character()/archetype builders (may be absent). */
export interface Rig {
  legL?: THREE.Group;
  legR?: THREE.Group;
  armL?: THREE.Group;
  armR?: THREE.Group;
}
export function rigOf(g: THREE.Object3D): Rig | undefined {
  return (g.userData && g.userData.rig) as Rig | undefined;
}
