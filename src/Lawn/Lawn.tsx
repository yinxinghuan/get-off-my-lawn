import { useCallback, useEffect, useRef, useState } from 'react';
import Scene, {
  PREP_SECONDS, TOWER_TYPES, projectStats,
  type GameCommands, type HudState, type InspectInfo, type NightReport, type WavePreview,
} from './Scene';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import type { LeaderboardEntry } from '@shared/leaderboard';
import { useGameEvent, getTelegramId, isInAigramNow, isCrazyGamesBuild } from '@shared/runtime';
import { unlockAudio, setMuted, isMuted, setMusic } from './audio';
import { Candle, Skull, Sound, Tomb, Finger, Flame, Frost, Burst, Crown, Bolt, Venom, Lock, PerkMark, Chain, WeaponGlyph, YardStone, SoulMark, ShardMark } from './icons';
import { getLang, t, type StrKey } from './i18n';
import {
  awardRun, buyRank, damageMul, getFurthest, getRanks, getShards, META_CAPS,
  nextRankCost, nextUnlock, startingCash, startingLives,
  type MetaRanks, type RunAward,
} from './meta';
import { deskRails, isGuestDesk, type DeskRails } from './desk';
import './Lawn.less';

const POSTER_URL = 'https://yinxinghuan.github.io/games/posters/get-off-my-lawn.png';
const TYPE_ICON = [Flame, Frost, Burst, Bolt, Venom]; // by TOWER_TYPES order
const WEAPON_KEY: Record<string, StrKey> = {
  brazier: 'wFire', frost: 'wFrost', mortar: 'wBone', storm: 'wStorm', venom: 'wPlague',
};
const SPARKS = [
  { x: 8, dx: -46, dy: -36, s: 1.1, c: '#ffd15e', d: 0, w: 8 },
  { x: 16, dx: -28, dy: -58, s: 0.7, c: '#ff8a2a', d: 0.05, w: 6 },
  { x: 24, dx: -18, dy: -28, s: 1.3, c: '#7ee7ff', d: 0.12, w: 10 },
  { x: 32, dx: -8, dy: -64, s: 0.6, c: '#ffd15e', d: 0.02, w: 5 },
  { x: 40, dx: 4, dy: -42, s: 1, c: '#7cff6b', d: 0.18, w: 7 },
  { x: 48, dx: 0, dy: -70, s: 0.8, c: '#fff6c2', d: 0.08, w: 6 },
  { x: 56, dx: 12, dy: -34, s: 1.2, c: '#ff8a2a', d: 0.14, w: 9 },
  { x: 64, dx: 22, dy: -60, s: 0.55, c: '#7ee7ff', d: 0.04, w: 5 },
  { x: 72, dx: 30, dy: -40, s: 1, c: '#ffd15e', d: 0.2, w: 8 },
  { x: 80, dx: 42, dy: -52, s: 0.75, c: '#7cff6b', d: 0.1, w: 6 },
  { x: 88, dx: 50, dy: -24, s: 1.15, c: '#ff8a2a', d: 0.16, w: 7 },
  { x: 12, dx: -36, dy: -18, s: 0.5, c: '#fff6c2', d: 0.22, w: 4 },
  { x: 36, dx: -6, dy: -22, s: 0.9, c: '#ffd15e', d: 0.26, w: 5 },
  { x: 52, dx: 8, dy: -16, s: 0.45, c: '#7ee7ff', d: 0.06, w: 4 },
  { x: 68, dx: 18, dy: -20, s: 0.85, c: '#e7e0cb', d: 0.24, w: 6 },
  { x: 84, dx: 34, dy: -14, s: 0.6, c: '#ffd15e', d: 0.3, w: 5 },
];
const PERK_TONE: Record<string, string> = {
  haste: 'common', sight: 'rare', edge: 'epic', souls: 'gold', candle: 'gold', tithe: 'rare',
};
const PERKS: { id: string; name: StrKey; desc: StrKey }[] = [
  { id: 'haste', name: 'perkHaste', desc: 'perkHasteD' },
  { id: 'sight', name: 'perkSight', desc: 'perkSightD' },
  { id: 'edge', name: 'perkEdge', desc: 'perkEdgeD' },
  { id: 'souls', name: 'perkSouls', desc: 'perkSoulsD' },
  { id: 'candle', name: 'perkCandle', desc: 'perkCandleD' },
  { id: 'tithe', name: 'perkTithe', desc: 'perkTitheD' },
];
const META_TRACKS: (keyof MetaRanks)[] = ['candle', 'purse', 'edge'];
const META_NAME: Record<keyof MetaRanks, StrKey> = {
  candle: 'rank_candle', purse: 'rank_purse', edge: 'rank_edge',
};
const META_DESC: Record<keyof MetaRanks, StrKey> = {
  candle: 'metaCandle', purse: 'metaPurse', edge: 'metaEdge',
};

type Phase = 'attract' | 'playing' | 'over';
const BEST_KEY = 'gol_best';

function freshHud(): HudState {
  const lives = startingLives();
  return {
    lives, cash: startingCash(), score: 0, wave: 0, towers: 0,
    bossHp: 0, bossName: '', maxLives: lives, upgrades: 0,
  };
}
function rollOffers(lives: number) {
  const pool = PERKS.filter((p) => p.id !== 'candle' || lives < 8);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = pool[i]; pool[i] = pool[j]; pool[j] = swap;
  }
  return pool.slice(0, 3);
}
function fmtStat(n: number) {
  const rounded = Math.round(n * 10) / 10;
  return rounded >= 10 ? String(Math.round(rounded)) : rounded.toFixed(1);
}
function lineupText(lineup: { key: string; count: number }[]) {
  return lineup.map((l) => `${t(l.key as StrKey)} ×${l.count}`).join(' · ');
}
function bossEta(wave: number) {
  if (wave <= 0) return 2;
  if (wave % 3 === 0) return 0;
  return 3 - (wave % 3);
}

function usePop(value: number, enabled: boolean) {
  const prev = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) { prev.current = value; return; }
    if (prev.current !== value) {
      prev.current = value;
      setN((x) => x + 1);
    }
  }, [value, enabled]);
  return n;
}

function useGuestDesk(): { desk: boolean; rails: DeskRails } {
  const [box, setBox] = useState(() => ({
    desk: isGuestDesk(),
    rails: deskRails(typeof window !== 'undefined' ? window.innerWidth : 1280),
  }));
  useEffect(() => {
    if (!isCrazyGamesBuild) return;
    const onResize = () => setBox({
      desk: isGuestDesk(),
      rails: deskRails(window.innerWidth),
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return box;
}

export function Lawn() {
  const [phase, setPhase] = useState<Phase>(
    typeof location !== 'undefined' && /debug|showcase/.test(location.search) ? 'playing' : 'attract',
  );
  const [hud, setHud] = useState<HudState>(freshHud);
  const [waveBanner, setWaveBanner] = useState<number | null>(null);
  const [bossBanner, setBossBanner] = useState(false);
  const [preview, setPreview] = useState<WavePreview | null>(null);
  const [choice, setChoice] = useState<NightReport | null>(null);
  const [offers, setOffers] = useState(rollOffers(5));
  const [arming, setArming] = useState(false);
  const [inspect, setInspect] = useState<InspectInfo | null>(null);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [award, setAward] = useState<RunAward | null>(null);
  const [ranks, setRanks] = useState<MetaRanks>(() => getRanks());
  const [shards, setShards] = useState(() => getShards());
  const [furthest, setFurthest] = useState(() => getFurthest());
  const submittedBest = useRef(0);
  const lastSubmitT = useRef(0);
  const [best, setBest] = useState<number>(() => Number(alteruLocalStorage.getItem(BEST_KEY) || 0));
  const [showBoard, setShowBoard] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [upgradeHint, setUpgradeHint] = useState(false);
  const [selectedType, setSelectedType] = useState(0);
  const [champ, setChamp] = useState<LeaderboardEntry | null>(null);
  const [unlockToast, setUnlockToast] = useState<string | null>(null);
  const { desk, rails } = useGuestDesk();
  const guest = isCrazyGamesBuild;
  const cashPop = usePop(hud.cash, guest);
  const scorePop = usePop(hud.score, guest);
  const shardPop = usePop(shards, guest);
  const offersRef = useRef(offers);
  offersRef.current = offers;
  const lastWave = useRef(0);
  const hintOnce = useRef(false);
  const commands = useRef<GameCommands>({ perk: null, start: false, upgrade: false, speed: 1 });
  commands.current.speed = speed;

  const bannerTimer = useRef<number | undefined>(undefined);
  const finalScore = useRef(0);
  const newBest = useRef(false);

  const { isInAigram, submitScore, fetchLeaderboard } = useGameScore();
  const events = useGameEvent();
  const preRunBest = useRef(0);

  useEffect(() => {
    if (!isInAigramNow() || phase === 'playing') return;
    fetchLeaderboard().then((rows) => setChamp(rows[0] || null)).catch(() => {});
  }, [phase, isInAigram, fetchLeaderboard]);

  useEffect(() => {
    if (phase !== 'playing' || !isInAigram || !getTelegramId()!) return;
    fetchLeaderboard().then((rows) => {
      const me = rows.find((r) => String(r.user_id) === String(getTelegramId()!));
      preRunBest.current = me ? Number(me.score) || 0 : 0;
    }).catch(() => {});
  }, [phase, isInAigram, fetchLeaderboard]);

  const sendBeatNotify = useCallback(async (myScore: number) => {
    if (!isInAigram || !getTelegramId()! || myScore <= preRunBest.current) return;
    try {
      const fresh = await fetchLeaderboard();
      const meId = String(getTelegramId()!);
      const beaten = fresh
        .filter((r) => String(r.user_id) !== meId)
        .map((r) => ({ id: String(r.user_id), score: Number(r.score) || 0 }))
        .filter((r) => r.score < myScore && r.score > preRunBest.current)
        .sort((a, b) => b.score - a.score)[0];
      if (!beaten) return;
      events.trigger('score_beat', {
        actions: [{
          type: 'notify',
          target_user_id: beaten.id,
          image: { ref_url: POSTER_URL, prompt: 'a spooky moonlit graveyard at night, a crypt defended by glowing spectral braziers against a crowd of zombies, skeletons and ghosts, fog' },
          message: {
            template: `{sender_name} out-haunted you — ${Math.round(myScore)} banished on Get Off My Grave.`,
            variables: ['sender_name'],
          },
        }],
      });
    } catch { /* silent */ }
  }, [isInAigram, fetchLeaderboard, events]);

  const onHud = useCallback((h: HudState) => setHud(h), []);
  const onWave = useCallback((p: WavePreview) => {
    setPreview(p);
    setWaveBanner(p.wave);
    setBossBanner(p.boss);
    setArming(p.wave > 1);
    window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => { setWaveBanner(null); setBossBanner(false); }, 2600);
  }, []);
  const onNightClear = useCallback((report: NightReport) => {
    setArming(false);
    setChoice(report);
    setOffers(rollOffers(report.lives));
  }, []);
  const onInspect = useCallback((info: InspectInfo) => setInspect(info), []);

  useEffect(() => {
    if (phase !== 'playing' || !isInAigram) return;
    if (hud.score > Math.max(preRunBest.current, submittedBest.current)) {
      const now = performance.now();
      if (now - lastSubmitT.current > 3500) {
        lastSubmitT.current = now;
        submittedBest.current = hud.score;
        submitScore(hud.score).catch(() => {});
      }
    }
  }, [hud.score, phase, isInAigram, submitScore]);

  const onGameOver = useCallback((score: number, wave: number) => {
    finalScore.current = score;
    newBest.current = false;
    setBest((b) => {
      if (score > b) { newBest.current = true; alteruLocalStorage.setItem(BEST_KEY, String(score)); return score; }
      return b;
    });
    const granted = awardRun(score, wave);
    setAward(granted);
    setShards(granted.total);
    setFurthest(granted.furthest);
    setRanks(getRanks());
    setChoice(null);
    setArming(false);
    submitScore(score).catch(() => {});
    sendBeatNotify(score);
    setPhase('over');
  }, [submitScore, sendBeatNotify]);
  const registerRestart = useCallback((_fn: () => void) => { /* scene resets itself when mode returns to play */ }, []);

  const resetRunChrome = () => {
    hintOnce.current = false;
    setUpgradeHint(false);
    setChoice(null);
    setArming(false);
    setInspect(null);
    setUnlockToast(null);
    setSelectedType(0);
    setHud(freshHud());
    commands.current.perk = null;
    commands.current.start = false;
    commands.current.upgrade = false;
    lastWave.current = 0;
    submittedBest.current = 0;
    lastSubmitT.current = 0;
  };
  const startGame = () => { unlockAudio(); setMusic('night'); resetRunChrome(); setPhase('playing'); };
  const again = () => { resetRunChrome(); setPhase('playing'); };
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };
  const toggleSpeed = () => setSpeed((s) => (s === 1 ? 2 : 1));
  const pickPerk = (id: string) => {
    commands.current.perk = id;
    setChoice(null);
    setArming(true);
  };
  const requestStart = () => {
    if (choice) return;
    commands.current.start = true;
    setArming(false);
  };

  useEffect(() => () => window.clearTimeout(bannerTimer.current), []);

  useEffect(() => {
    if (phase !== 'playing') { setMusic('off'); return; }
    setMusic(hud.bossHp > 0 ? 'boss' : 'night');
  }, [phase, hud.bossHp]);

  useEffect(() => {
    if (!arming) return;
    const id = window.setTimeout(() => setArming(false), Math.round(PREP_SECONDS * 1000) + 120);
    return () => window.clearTimeout(id);
  }, [arming, preview?.wave]);

  // one-time upgrade hint. A timeout that lives in the same effect as the
  // "towers just became 1" check gets cleared by Strict Mode and never returns,
  // which left the hint on screen for the whole night.
  useEffect(() => {
    if (phase !== 'playing') { hintOnce.current = false; setUpgradeHint(false); return; }
    if (hintOnce.current || hud.towers < 1) return;
    hintOnce.current = true;
    setUpgradeHint(true);
  }, [phase, hud.towers]);
  useEffect(() => {
    if (!upgradeHint) return;
    if (hud.upgrades > 0 || hud.wave >= 2 || choice) { setUpgradeHint(false); return; }
    // Guest: the night banner owns the one toast slot. Hold the hint until it leaves.
    if (guest && waveBanner != null) return;
    const id = window.setTimeout(() => setUpgradeHint(false), 3200);
    return () => window.clearTimeout(id);
  }, [upgradeHint, hud.upgrades, hud.wave, choice, waveBanner, guest]);

  useEffect(() => {
    const w = hud.wave;
    if (w <= lastWave.current) return;
    lastWave.current = w;
    const just = TOWER_TYPES.find((tw) => tw.unlock === w);
    if (!just) return;
    setUnlockToast(t(WEAPON_KEY[just.id] || 'wFire'));
  }, [hud.wave]);
  useEffect(() => {
    if (!unlockToast) return;
    if (guest && waveBanner != null) return;
    const id = window.setTimeout(() => setUnlockToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [unlockToast, waveBanner, guest]);

  useEffect(() => {
    if (phase !== 'playing') return;
    function onKey(e: KeyboardEvent) {
      if (showBoard) return;
      const k = e.key;
      if (k === ' ' || e.code === 'Space') {
        e.preventDefault();
        requestStart();
      } else if ((k === 'u' || k === 'U') && !choice) {
        commands.current.upgrade = true;
      } else if (k === 'f' || k === 'F') {
        toggleSpeed();
      } else if (guest && choice && k >= '1' && k <= '3') {
        const offer = offersRef.current[Number(k) - 1];
        if (offer) pickPerk(offer.id);
      } else if (k >= '1' && k <= '5' && !choice) {
        const i = Number(k) - 1;
        const tw = TOWER_TYPES[i];
        if (tw && (hud.wave || 1) >= tw.unlock) setSelectedType(i);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, choice, showBoard, hud.wave]);

  const sel = TOWER_TYPES[selectedType];
  const mods = { dmg: damageMul(), rate: 1, range: 1, bounty: 1 };
  const plate: InspectInfo = inspect && (inspect.mode === 'upgrade' || inspect.typeId === sel.id)
    ? inspect
    : {
      mode: 'place', typeId: sel.id, name: sel.name, level: 1,
      ...(() => {
        const s = projectStats(selectedType, 1, mods);
        return { range: s.range, dmg: s.dmg, rate: s.rate, nextRange: s.range, nextDmg: s.dmg, nextRate: s.rate, cost: sel.cost };
      })(),
    };
  const eta = bossEta(hud.wave);
  const nightCount = hud.wave || 1;
  const prog = nextUnlock(award?.furthest ?? furthest, ranks, shards);
  const candleSlots = Math.max(5, hud.maxLives || 5);

  const champPill = (cls: string) => (!isInAigram ? null : (
    <button className={`gol-champ ${cls}`} onPointerDown={(e) => { e.stopPropagation(); setShowBoard(true); }}>
      <span className="gol-champ-crown"><Crown /></span>
      {champ ? (
        <>
          {champ.avatar_url
            ? <img className="gol-champ-av" src={champ.avatar_url} alt="" />
            : <span className="gol-champ-avf">{(champ.name || '?').slice(0, 1)}</span>}
          <span className="gol-champ-nm">{champ.name}</span>
          <span className="gol-champ-sc">{champ.score}</span>
        </>
      ) : <span className="gol-champ-nm">{t('leaderboard')}</span>}
    </button>
  ));

  return (
    <div
      className={`gol${guest ? ' gol--cg' : ''}${desk ? ' gol--desk' : ''}`}
      style={desk ? { ['--rail-l' as string]: `${rails.left}px`, ['--rail-r' as string]: `${rails.right}px` } : undefined}
    >
      <Scene
        mode={phase === 'playing' ? 'play' : phase === 'over' ? 'over' : 'attract'}
        selectedType={selectedType}
        onHud={onHud}
        onWave={onWave}
        onNightClear={onNightClear}
        onInspect={onInspect}
        onGameOver={onGameOver}
        registerRestart={registerRestart}
        commands={commands}
        desk={desk}
        rails={rails}
        guest={guest}
      />

      {phase === 'playing' && (
        <>
          <div className="gol-rail">
          <div className="gol-hud gol-lives">
            {Array.from({ length: candleSlots }, (_, i) => <Candle key={i} lit={i < hud.lives} />)}
          </div>
          {champPill('gol-champ--play')}
          <div className="gol-hud gol-score">
            <span className={`gol-score-n${scorePop ? ' gol-numpop' : ''}`} key={scorePop}>{hud.score}</span>
            <span className="gol-score-k">{t('score')}</span>
            <span className="gol-score-row">
              <span className="gol-score-night"><b>{t('wave')}</b> {nightCount}</span>
              <span className={`gol-score-boss${eta === 0 ? ' gol-score-boss--now' : ''}`}>
                {eta === 0 ? t('bossNow') : <>{t('bossIn')} {eta}</>}
              </span>
            </span>
            {hud.bossHp > 0 && (
              <div className="gol-bossbar">
                <span>{t((hud.bossName || 'elite') as StrKey)}</span>
                <div className="gol-bossbar-track"><div style={{ width: `${Math.round(hud.bossHp * 100)}%` }} /></div>
              </div>
            )}
          </div>

          {!choice && (
            <div className="gol-plate" key={guest ? `${plate.mode}:${plate.typeId}:${plate.level}` : 'plate'}>
              <b>{t(WEAPON_KEY[plate.typeId] || 'wFire')}</b>
              {plate.mode === 'upgrade'
                ? <>
                  <span>{t('lv')} {plate.level}→{plate.level + 1}</span>
                  <span>{t('dmg')} {fmtStat(plate.dmg)}→{fmtStat(plate.nextDmg)}</span>
                  <span>{t('range')} {fmtStat(plate.range)}→{fmtStat(plate.nextRange)}</span>
                  <span>{t('rate')} {fmtStat(plate.rate)}→{fmtStat(plate.nextRate)}</span>
                  <span className="up"><Skull size={12} /> {plate.cost}</span>
                </>
                : <>
                  <span>{t('dmg')} {fmtStat(plate.dmg)}</span>
                  <span>{t('range')} {fmtStat(plate.range)}</span>
                  <span>{t('rate')} {fmtStat(plate.rate)}/s</span>
                </>}
              {desk && <span className="gol-plate-u"><kbd>U</kbd> {t('keyUpgrade')}</span>}
            </div>
          )}
          <div className="gol-rail-gap">
            {desk && !choice && (
              <div className="gol-coming">
                <YardStone />
                <div className="gol-coming-k">{preview && preview.lineup.length > 0 ? t('onThePath') : t('railWait')}</div>
                {preview && preview.lineup.length > 0 && (
                  <div className="gol-coming-line">{lineupText(preview.lineup)}</div>
                )}
                <div className={`gol-coming-boss${eta === 0 ? ' is-now' : ''}`}>
                  {eta === 0 ? <b>{t('bossNow')}</b> : <><b>{eta}</b><span>{t('bossIn')}</span></>}
                </div>
                <div className="gol-shards"><ShardMark size={16} /><span className={`gol-shards-n${shardPop ? ' gol-numpop' : ''}`} key={shardPop}>{shards}</span><span className="gol-shards-k">{t('shards')}</span></div>
              </div>
            )}
          </div>
          {desk && !choice && (
            <div className="gol-deskkeys">
              <span><kbd>Space</kbd> {t('keyStart')}</span>
            </div>
          )}
          <div className={`gol-hud gol-souls${hud.cash >= sel.cost ? ' gol-souls--ready' : ''}`}>
            {guest ? <SoulMark size={18} /> : <Skull />} <span className={`gol-souls-n${cashPop ? ' gol-numpop' : ''}`} key={cashPop}>{hud.cash}</span> <span className="gol-souls-k">{t('souls')}</span>
          </div>
          </div>

          {hud.wave < 2 && !choice && (
            <div className="gol-keystrip">
              <span><kbd>1-5</kbd> {t('keyWeapons')}</span>
              <span><kbd>U</kbd> {t('keyUpgrade')}</span>
              <span><kbd>Space</kbd> {t('keyStart')}</span>
              <span><kbd>F</kbd> {t('keySpeed')}</span>
            </div>
          )}

          {hud.towers === 0 && !choice && (
            <div className="gol-guide">
              <div className="gol-finger"><Finger /></div>
              {hud.cash >= sel.cost
                ? <div className="gol-guide-txt"><b>{desk ? t('clickBuild') : t('guideBuild')}</b><span>{desk ? t('clickBuildSub') : t('guideBuildSub')}</span></div>
                : <div className="gol-guide-txt"><b>{t('guideEarn')}</b></div>}
            </div>
          )}
          {!guest && upgradeHint && !choice && <div className="gol-hint">{t('tapUpgrade2')}</div>}

          <div className="gol-tray">
            {TOWER_TYPES.map((tw, i) => {
              const Ico = TYPE_ICON[i] || Flame;
              const locked = (hud.wave || 1) < tw.unlock;
              const affordable = hud.cash >= tw.cost;
              if (locked) {
                return (
                  <button key={tw.id} className="gol-card gol-card--locked" disabled>
                    <span className="gol-card-key">{i + 1}</span>
                    {guest && <span className="gol-card-chain"><Chain /></span>}
                    <span className="gol-card-ico">{guest ? <WeaponGlyph id={tw.id} /> : <Lock size={22} />}</span>
                    <span className="gol-card-body">
                      <span className="gol-card-name">{t(WEAPON_KEY[tw.id])}</span>
                      <span className="gol-card-cost gol-card-unlock">{t('wave')} {tw.unlock}</span>
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={tw.id}
                  className={`gol-card${i === selectedType ? ' gol-card--sel' : ''}${affordable ? '' : ' gol-card--poor'}`}
                  onPointerDown={(e) => { e.stopPropagation(); setSelectedType(i); }}
                >
                  <span className="gol-card-key">{i + 1}</span>
                  <span className="gol-card-ico">{guest ? <WeaponGlyph id={tw.id} /> : <Ico size={26} />}</span>
                  <span className="gol-card-body">
                    <span className="gol-card-name">{t(WEAPON_KEY[tw.id])}</span>
                    <span className="gol-card-cost">{guest ? <SoulMark size={14} /> : <Skull size={13} />} {tw.cost}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {!guest && unlockToast && (
            <div className="gol-unlock" key={unlockToast}>
              <span className="gol-unlock-k">{t('newWeapon')}</span>
              <span className="gol-unlock-n">{unlockToast}</span>
            </div>
          )}

          <button
            className={`gol-speed${speed === 2 ? ' gol-speed--fast' : ''}`}
            onPointerDown={(e) => { e.stopPropagation(); toggleSpeed(); }}
            aria-label={t('speedLabel')}
          >
            {desk && <kbd>F</kbd>}
            {speed === 2 ? '2×' : '1×'}
          </button>
        </>
      )}

      {guest && phase === 'playing' && !choice && (waveBanner != null || unlockToast || upgradeHint) && (
        <div className="gol-toasts">
          {waveBanner != null ? (
            <div className={`gol-wavebanner${bossBanner ? ' gol-wavebanner--boss' : ''}`} key={waveBanner}>
              {bossBanner && (
                <span className="gol-bosswarn">
                  {t('boss')}{preview?.bossName ? ` · ${t(preview.bossName as StrKey)}` : ''}
                </span>
              )}
              <span>{t('wave')} {waveBanner}</span>
              {preview && preview.lineup.length > 0 && (
                <span className="gol-lineup">{lineupText(preview.lineup)}</span>
              )}
            </div>
          ) : unlockToast ? (
            <div className="gol-unlock" key={unlockToast}>
              <span className="gol-unlock-k">{t('newWeapon')}</span>
              <span className="gol-unlock-n">{unlockToast}</span>
            </div>
          ) : (
            <div className="gol-hint">{desk ? t('clickUpgrade2') : t('tapUpgrade2')}</div>
          )}
        </div>
      )}
      {!guest && waveBanner != null && phase === 'playing' && !choice && (
        <div className={`gol-wavebanner${bossBanner ? ' gol-wavebanner--boss' : ''}`} key={waveBanner}>
          {bossBanner && (
            <span className="gol-bosswarn">
              {t('boss')}{preview?.bossName ? ` · ${t(preview.bossName as StrKey)}` : ''}
            </span>
          )}
          <span>{t('wave')} {waveBanner}</span>
          {preview && preview.lineup.length > 0 && (
            <span className="gol-lineup">{lineupText(preview.lineup)}</span>
          )}
        </div>
      )}
      {arming && phase === 'playing' && !choice && (
        <button className="gol-arm" onPointerDown={(e) => { e.stopPropagation(); requestStart(); }}>
          {t('beginNight')}
        </button>
      )}

      {choice && phase === 'playing' && (
        <div className="gol-choice-back">
          <div className={`gol-choice${guest ? ' gol-choice--fanfare' : ''}`}>
            {guest ? (
              <div className="gol-fanfare">
                <div className="gol-sparks" aria-hidden>
                  {SPARKS.map((s, i) => (
                    <i
                      key={i}
                      style={{
                        left: `${s.x}%`,
                        width: s.w,
                        height: s.w,
                        background: s.c,
                        animationDelay: `${s.d}s`,
                        ['--dx' as string]: `${s.dx}px`,
                        ['--dy' as string]: `${s.dy}px`,
                        ['--s' as string]: String(s.s),
                      }}
                    />
                  ))}
                </div>
                <div className="gol-fanfare-ribbon">{t('wave')} {choice.wave}</div>
                <div className="gol-fanfare-title">{t('clearedBang')}</div>
              </div>
            ) : (
              <div className="gol-choice-k">{t('wave')} {choice.wave} {t('nightClear')}</div>
            )}
            <div className="gol-choice-stats">
              <span><b>{choice.kills}</b> {t('nightKills')}</span>
              <span><b>{choice.souls}</b> {t('nightSouls')}</span>
              <span><b>{choice.lives}</b> {t('nightCandles')}</span>
            </div>
            <div className="gol-choice-h">{guest ? t('takePrize') : t('chooseOne')}</div>
            <div className="gol-choice-row">
              {offers.map((o, i) => (
                <button key={o.id} className={`gol-offer gol-offer--${PERK_TONE[o.id] || 'common'}`} onPointerDown={(e) => { e.stopPropagation(); pickPerk(o.id); }}>
                  {guest && <span className="gol-offer-key">{i + 1}</span>}
                  {guest && <PerkMark id={o.id} />}
                  <b>{t(o.name)}</b>
                  <span>{t(o.desc)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'attract' && (
        <>
          <div className="gol-tapcatch" onPointerDown={startGame} />
          <div className="gol-logo">
            <span className={`wm${getLang() === 'zh' ? ' wm--zh' : ''}`}>
              {getLang() === 'zh' ? t('title') : <>Get Off<br />My Grave</>}
            </span>
          </div>
          {champPill('gol-champ--attract')}
          <div className="gol-startguide">
            <div className="gol-tapcue" aria-hidden>
              <span className="gol-tapcue-pad" />
              <span className="gol-tapcue-ring" />
              <span className="gol-tapcue-ring gol-tapcue-ring--late" />
              <div className="gol-finger"><Finger /></div>
            </div>
            <div className="gol-start-cta">{desk ? t('clickToStart') : t('tapToStart')}</div>
            <div className="gol-keys">
              <span><kbd>1-5</kbd> {t('keyWeapons')}</span>
              <span><kbd>U</kbd> {t('keyUpgrade')}</span>
              <span><kbd>Space</kbd> {t('keyStart')}</span>
              <span><kbd>F</kbd> {t('keySpeed')}</span>
            </div>
          </div>
        </>
      )}

      {phase === 'over' && (
        <div className="gol-overlay">
          <div className="gol-card-over">
            <div className="gol-kicker">{t('gameOver')}</div>
            <div className="gol-overttl">{t('title')}</div>
            <div className="gol-fell">{t('wave')} {award?.night || hud.wave || 1}</div>
            <div className="gol-stats">
              <div className="gol-stat">
                <span className="k">{t('score')}</span>
                <span className="v">{finalScore.current}</span>
              </div>
              <div className="gol-stat gol-stat--best">
                <span className="k">{t('best')}</span>
                <span className="v">{best}</span>
              </div>
              <div className="gol-stat">
                <span className="k">{t('furthest')}</span>
                <span className="v">{award?.furthest ?? furthest}</span>
              </div>
              <div className="gol-stat gol-stat--shards">
                <span className="k">{t('shards')}</span>
                <span className="v">{shards}</span>
              </div>
            </div>
            {award && <div className="gol-shardline">{t('shardsPlus', { n: award.earned })}</div>}
            {newBest.current && <div className="gol-newbest">{t('newBest')}</div>}
            <div className="gol-next">
              <div className="gol-next-k">{t('nextUnlock')}</div>
              <div className="gol-next-n">{t(prog.id)}</div>
              <div className="gol-next-bar"><div style={{ width: `${Math.min(100, (prog.have / Math.max(1, prog.need)) * 100)}%` }} /></div>
              <div className="gol-next-p">{prog.have}/{prog.need}</div>
            </div>
            <div className="gol-meta">
              {META_TRACKS.map((track) => {
                const cost = nextRankCost(track, ranks);
                const rank = ranks[track];
                const cap = META_CAPS[track];
                const afford = cost != null && shards >= cost;
                return (
                  <button
                    key={track}
                    className={`gol-meta-btn${afford ? '' : ' gol-meta-btn--poor'}`}
                    disabled={cost == null}
                    onPointerDown={(e) => { e.stopPropagation(); if (buyRank(track)) { setShards(getShards()); setRanks(getRanks()); } }}
                  >
                    <b>{t(META_NAME[track])}</b>
                    <span>{t(META_DESC[track])}</span>
                    <em>{cost == null ? t('maxed') : `${rank}/${cap} · ${cost}`}</em>
                  </button>
                );
              })}
            </div>
            <div className="gol-meta-note">{t('metaNext')}</div>
            <div className="gol-btns">
              <button className="gol-btn gol-btn--primary" onPointerDown={again}>{t('again')}</button>
              {(isInAigram || isCrazyGamesBuild) && (
                <button className="gol-btn gol-btn--ghost" onPointerDown={() => setShowBoard(true)}>
                  <Tomb /> {t('leaderboard')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <button className="gol-mute" onPointerDown={toggleMute}><Sound on={!muted} /></button>

      {showBoard && (
        <Leaderboard
          gameName={t('title')}
          isInAigram={isInAigram}
          fetch={fetchLeaderboard}
          onClose={() => setShowBoard(false)}
        />
      )}
    </div>
  );
}

export default Lawn;
