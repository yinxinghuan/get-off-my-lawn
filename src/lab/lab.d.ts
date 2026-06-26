// The low-poly voxel asset builders are plain ESM JS ported from _lowpoly_lab.
// They return THREE.Group instances. We import them untyped (as `any`) — Vite
// transpiles + bundles them; we don't run tsc over the JS.
declare module '@lab/*';
