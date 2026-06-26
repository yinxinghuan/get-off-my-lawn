import { useCallback, useEffect, useRef, useState } from 'react';
import Scene, { type HudState } from './Scene';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import { useGameEvent, telegramId } from '@shared/runtime';
import { unlockAudio, setMuted, isMuted } from './audio';
import { Candle, Skull, Sound, Tomb, Finger } from './icons';
import { t } from './i18n';
import './Lawn.less';

const POSTER_URL = 'https://yinxinghuan.github.io/games/posters/get-off-my-lawn.png';
const TOWER_COST = 90;

type Phase = 'attract' | 'playing' | 'over';
const BEST_KEY = 'gol_best';

export function Lawn() {
  const [phase, setPhase] = useState<Phase>(
    typeof location !== 'undefined' && location.search.includes('debug') ? 'playing' : 'attract',
  );
  const [hud, setHud] = useState<HudState>({ lives: 5, cash: 175, score: 0, wave: 0, towers: 0 });
  const [waveBanner, setWaveBanner] = useState<number | null>(null);
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem(BEST_KEY) || 0));
  const [showBoard, setShowBoard] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [upgradeHint, setUpgradeHint] = useState(false);
  const prevTowers = useRef(0);

  const restartRef = useRef<() => void>(() => {});
  const bannerTimer = useRef<number | undefined>(undefined);
  const finalScore = useRef(0);
  const newBest = useRef(false);

  const { isInAigram, submitScore, fetchLeaderboard } = useGameScore();
  const events = useGameEvent();
  const preRunBest = useRef(0);

  // snapshot my standing on the board when a run starts
  useEffect(() => {
    if (phase !== 'playing' || !isInAigram || !telegramId) return;
    fetchLeaderboard().then((rows) => {
      const me = rows.find((r) => String(r.user_id) === String(telegramId));
      preRunBest.current = me ? Number(me.score) || 0 : 0;
    }).catch(() => {});
  }, [phase, isInAigram, fetchLeaderboard]);

  // after a run, ping the nearest rival I just overtook (score_beat rivalry loop)
  const sendBeatNotify = useCallback(async (myScore: number) => {
    if (!isInAigram || !telegramId || myScore <= preRunBest.current) return;
    try {
      const fresh = await fetchLeaderboard();
      const meId = String(telegramId);
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
  const onWave = useCallback((w: number) => {
    setWaveBanner(w);
    window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setWaveBanner(null), 1500);
  }, []);
  const onGameOver = useCallback((score: number) => {
    finalScore.current = score;
    newBest.current = false;
    setBest((b) => {
      if (score > b) { newBest.current = true; localStorage.setItem(BEST_KEY, String(score)); return score; }
      return b;
    });
    submitScore(score).catch(() => {});
    sendBeatNotify(score);
    setPhase('over');
  }, [submitScore, sendBeatNotify]);
  const registerRestart = useCallback((fn: () => void) => { restartRef.current = fn; }, []);

  const startGame = () => { unlockAudio(); prevTowers.current = 0; setPhase('playing'); };
  const again = () => { prevTowers.current = 0; setPhase('playing'); };
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };

  useEffect(() => () => window.clearTimeout(bannerTimer.current), []);

  // when the first brazier goes down, flash a one-time "tap to upgrade" hint
  useEffect(() => {
    if (prevTowers.current === 0 && hud.towers === 1) {
      setUpgradeHint(true);
      const id = window.setTimeout(() => setUpgradeHint(false), 3600);
      prevTowers.current = hud.towers;
      return () => window.clearTimeout(id);
    }
    prevTowers.current = hud.towers;
  }, [hud.towers]);

  return (
    <div className="gol">
      <Scene
        mode={phase === 'playing' ? 'play' : phase === 'over' ? 'over' : 'attract'}
        onHud={onHud}
        onWave={onWave}
        onGameOver={onGameOver}
        registerRestart={registerRestart}
      />

      {/* ── playing HUD ── */}
      {phase === 'playing' && (
        <>
          <div className="gol-hud gol-lives">
            {[0, 1, 2, 3, 4].map((i) => <Candle key={i} lit={i < hud.lives} />)}
          </div>
          <div className="gol-hud gol-souls"><Skull /> {hud.cash}</div>
          <div className="gol-hud gol-meta">
            <span className="gol-chip"><b>{t('wave')}</b> {hud.wave || 1}</span>
            <span className="gol-chip gol-chip--score">{hud.score} <b>{t('score')}</b></span>
          </div>

          {/* build guide — persists until the first brazier is placed; tells when + how */}
          {hud.towers === 0 && (
            <div className="gol-guide">
              <div className="gol-finger"><Finger /></div>
              {hud.cash >= TOWER_COST ? (
                <div className="gol-guide-txt">
                  <b>{t('guideBuild')}</b>
                  <span>{t('guideBuildSub')} · {TOWER_COST} {t('souls')}</span>
                </div>
              ) : (
                <div className="gol-guide-txt"><b>{t('guideEarn')}</b></div>
              )}
            </div>
          )}
          {upgradeHint && <div className="gol-hint">{t('tapUpgrade')}</div>}
        </>
      )}

      {waveBanner != null && phase === 'playing' && (
        <div className="gol-wavebanner" key={waveBanner}>{t('wave')} {waveBanner}</div>
      )}

      {/* ── attract ── */}
      {phase === 'attract' && (
        <div className="gol-overlay" onPointerDown={startGame}>
          <div className="gol-wordmark">
            <span className="wm">Get Off<br />My Grave</span>
            <span className="sub">{t('tapPlant')}</span>
          </div>
          <div className="gol-cta">{t('tapToStart')}</div>
        </div>
      )}

      {/* ── game over ── */}
      {phase === 'over' && (
        <div className="gol-overlay">
          <div className="gol-card">
            <div className="gol-kicker">{t('gameOver')}</div>
            <div className="gol-overttl">{t('title')}</div>
            <div className="gol-stats">
              <div className="gol-stat">
                <span className="k">{t('score')}</span>
                <span className="v">{finalScore.current}</span>
              </div>
              <div className="gol-stat gol-stat--best">
                <span className="k">{t('best')}</span>
                <span className="v">{best}</span>
              </div>
            </div>
            {newBest.current && <div className="gol-newbest">{t('newBest')}</div>}
            <div className="gol-btns">
              <button className="gol-btn gol-btn--primary" onPointerDown={again}>{t('again')}</button>
              {isInAigram && (
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
