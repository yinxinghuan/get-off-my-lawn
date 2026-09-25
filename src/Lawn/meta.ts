// Persistent graveyard progression. localStorage only — the AlterU host and the
// Crazy Games guest build both keep it on the device (scoped storage adapter).

const SHARDS_KEY = 'gol_shards';
const FURTHEST_KEY = 'gol_furthest';
const RANKS_KEY = 'gol_meta';

export const BASE_LIVES = 5;
export const BASE_CASH = 180;

export interface MetaRanks {
  candle: number; // 0..2  extra starting candles
  purse: number;  // 0..3  +25 starting souls each
  edge: number;   // 0..3  +6% tower damage each
}

export const META_CAPS: MetaRanks = { candle: 2, purse: 3, edge: 3 };

/** Soul-shard cost of each rank, index = current rank (the price of the NEXT one). */
export const META_COSTS: Record<keyof MetaRanks, number[]> = {
  candle: [40, 90],
  purse: [30, 70, 130],
  edge: [50, 110, 190],
};

export type UnlockId =
  | 'unlockStorm'
  | 'unlockPlague'
  | 'unlockDone'
  | 'rank_candle'
  | 'rank_purse'
  | 'rank_edge';

function clampRank(n: unknown, cap: number) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(0, Math.min(cap, v));
}

export function getShards(): number {
  return Math.max(0, Math.floor(Number(alteruLocalStorage.getItem(SHARDS_KEY) || 0)));
}

export function getFurthest(): number {
  return Math.max(0, Math.floor(Number(alteruLocalStorage.getItem(FURTHEST_KEY) || 0)));
}

export function getRanks(): MetaRanks {
  try {
    const raw = JSON.parse(alteruLocalStorage.getItem(RANKS_KEY) || '{}') as Partial<MetaRanks>;
    return {
      candle: clampRank(raw.candle, META_CAPS.candle),
      purse: clampRank(raw.purse, META_CAPS.purse),
      edge: clampRank(raw.edge, META_CAPS.edge),
    };
  } catch {
    return { candle: 0, purse: 0, edge: 0 };
  }
}

export function startingLives(ranks: MetaRanks = getRanks()): number {
  return BASE_LIVES + ranks.candle;
}

export function startingCash(ranks: MetaRanks = getRanks()): number {
  return BASE_CASH + ranks.purse * 25;
}

export function damageMul(ranks: MetaRanks = getRanks()): number {
  return 1 + ranks.edge * 0.06;
}

/**
 * Run performance → shards. Night reached weighs more than raw kills, and a
 * failed first night still leaves a handful so the currency is visible.
 */
export function shardGrant(score: number, night: number): number {
  return Math.max(4, Math.max(1, night) * 6 + Math.floor(Math.max(0, score) / 4));
}

export interface RunAward {
  earned: number;
  total: number;
  furthest: number;
  night: number;
  isFurthest: boolean;
}

export function awardRun(score: number, night: number): RunAward {
  const earned = shardGrant(score, night);
  const total = getShards() + earned;
  const prev = getFurthest();
  const furthest = Math.max(prev, Math.max(0, night));
  alteruLocalStorage.setItem(SHARDS_KEY, String(total));
  alteruLocalStorage.setItem(FURTHEST_KEY, String(furthest));
  return { earned, total, furthest, night: Math.max(0, night), isFurthest: night > prev && night > 0 };
}

export function nextRankCost(track: keyof MetaRanks, ranks: MetaRanks = getRanks()): number | null {
  const rank = ranks[track];
  if (rank >= META_CAPS[track]) return null;
  return META_COSTS[track][rank];
}

export function buyRank(track: keyof MetaRanks): boolean {
  const ranks = getRanks();
  const cost = nextRankCost(track, ranks);
  if (cost == null) return false;
  const shards = getShards();
  if (shards < cost) return false;
  ranks[track] += 1;
  alteruLocalStorage.setItem(SHARDS_KEY, String(shards - cost));
  alteruLocalStorage.setItem(RANKS_KEY, JSON.stringify(ranks));
  return true;
}

export interface NextUnlock {
  kind: 'night' | 'rank';
  id: UnlockId;
  have: number;
  need: number;
}

const WEAPON_GATES: { night: number; id: UnlockId }[] = [
  { night: 4, id: 'unlockStorm' },
  { night: 8, id: 'unlockPlague' },
];

/** Next goal: survive to the next weapon night, otherwise the cheapest meta rank. */
export function nextUnlock(furthest = getFurthest(), ranks = getRanks(), shards = getShards()): NextUnlock {
  for (const g of WEAPON_GATES) {
    if (furthest < g.night) return { kind: 'night', id: g.id, have: furthest, need: g.night };
  }
  let best: NextUnlock | null = null;
  (Object.keys(META_CAPS) as (keyof MetaRanks)[]).forEach((track) => {
    const cost = nextRankCost(track, ranks);
    if (cost == null) return;
    const id = ('rank_' + track) as UnlockId;
    if (!best || cost < best.need) best = { kind: 'rank', id, have: Math.min(shards, cost), need: cost };
  });
  if (best) return best;
  return { kind: 'night', id: 'unlockDone', have: 1, need: 1 };
}
