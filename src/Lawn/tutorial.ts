// First-run guest tutorial. Host builds never read this key.

const KEY = 'gol_tutorial_done';

export function tutorialDone(): boolean {
  return alteruLocalStorage.getItem(KEY) === '1';
}

export function markTutorialDone(): void {
  alteruLocalStorage.setItem(KEY, '1');
}

export function clearTutorial(): void {
  alteruLocalStorage.removeItem(KEY);
}
