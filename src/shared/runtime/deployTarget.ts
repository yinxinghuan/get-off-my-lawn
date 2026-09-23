// Build target. `vite build --mode crazygames` sets MODE to "crazygames".
// Vite replaces `import.meta.env.MODE` at build time, so Crazy Games branches
// can be removed from that bundle.
export const isCrazyGamesBuild: boolean = import.meta.env.MODE === 'crazygames';
