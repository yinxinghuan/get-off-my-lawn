// First-run guest tutorial. Host builds never read these keys.
// `done` means the coach is finished. `seen` remembers steps already taught,
// so a night-1 death does not replay placing and starting.

const DONE = 'gol_tutorial_done';
const SEEN = 'gol_tutorial_seen';

export type TaughtStep = 'place' | 'march' | 'upgrade' | 'speed' | 'perk';

export function tutorialDone(): boolean {
  return alteruLocalStorage.getItem(DONE) === '1';
}

export function seenSteps(): Set<TaughtStep> {
  const raw = alteruLocalStorage.getItem(SEEN) || '';
  const out = new Set<TaughtStep>();
  for (const part of raw.split(',')) {
    if (part === 'place' || part === 'march' || part === 'upgrade' || part === 'speed' || part === 'perk') out.add(part);
  }
  return out;
}

export function markSteps(steps: TaughtStep[]): void {
  if (tutorialDone()) return;
  const seen = seenSteps();
  for (const step of steps) seen.add(step);
  alteruLocalStorage.setItem(SEEN, [...seen].join(','));
}

export function markTutorialDone(): void {
  alteruLocalStorage.setItem(DONE, '1');
  alteruLocalStorage.removeItem(SEEN);
}

export function clearTutorial(): void {
  alteruLocalStorage.removeItem(DONE);
  alteruLocalStorage.removeItem(SEEN);
}
