import { useCallback, useEffect, useRef, useState } from 'react';
import Scene, { type HudState } from './Scene';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import { useGameEvent, telegramId } from '@shared/runtime';
import { unlockAudio, setMuted, isMuted } from './audio';
import { t } from './i18n';
import './Lawn.less';

const POSTER_URL = 'https://yinxinghuan.github.io/games/posters/get-off-my-lawn.png';

type Phase = 'attract' | 'playing' | 'over';
const BEST_KEY = 'gol_best';

export function Lawn() {
  const [phase, setPhase] = useState<Phase>(
    typeof location !== 'undefined' && location.search.includes('debug') ? 'playing' : 'attract',
  );
  const [hud, setHud] = useState<HudState>({ lives: 5, cash: 175, score: 0, wave: 0 });
  const [waveBanner, setWaveBanner] = useState<number | null>(null);
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem(BEST_KEY) || 0));
  const [showBoard, setShowBoard] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [hintOn, setHintOn] = useState(false);

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

  const startGame = () => {
    unlockAudio();
    setPhase('playing');   // Scene resets the board on the play transition
    setHintOn(true);
    window.setTimeout(() => setHintOn(false), 3600);
  };
  const again = () => {
    // over -> play is a mode change, so Scene's play-effect re-fires the reset
    setPhase('playing');
    setHintOn(true);
    window.setTimeout(() => setHintOn(false), 3000);
  };
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };

  useEffect(() => () => window.clearTimeout(bannerTimer.current), []);

  const hearts = '🕯️'.repeat(Math.max(0, hud.lives)) + '·'.repeat(Math.max(0, 5 - hud.lives));

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
          <div className="gol-hud gol-hud--top">
            <div className="gol-lives">{hearts}</div>
            <div className="gol-cash">💀 {hud.cash}</div>
          </div>
          <div className="gol-hud gol-hud--wave">
            <span className="gol-wave-num">{t('wave')} {hud.wave || 1}</span>
            <span className="gol-repelled">{hud.score} {t('score')}</span>
          </div>
          {hintOn && <div className="gol-hint">{t('tapPlant')}</div>}
        </>
      )}

      {waveBanner != null && phase === 'playing' && (
        <div className="gol-wavebanner" key={waveBanner}>{t('wave')} {waveBanner}</div>
      )}

      {/* ── attract ── */}
      {phase === 'attract' && (
        <div className="gol-overlay" onPointerDown={startGame}>
          <div className="gol-title">{t('title')}</div>
          <div className="gol-sub">{t('tapPlant')}</div>
          <div className="gol-cta">{t('tapToStart')}</div>
        </div>
      )}

      {/* ── game over ── */}
      {phase === 'over' && (
        <div className="gol-overlay gol-overlay--over">
          <div className="gol-gameover">{t('gameOver')}</div>
          <div className="gol-finalwrap">
            <div className="gol-final">{finalScore.current}</div>
            <div className="gol-finallabel">{t('score')}</div>
          </div>
          {newBest.current
            ? <div className="gol-newbest">{t('newBest')}</div>
            : <div className="gol-best">{t('best')} {best}</div>}
          <button className="gol-btn gol-btn--primary" onPointerDown={again}>{t('again')}</button>
          {isInAigram && (
            <button className="gol-btn" onPointerDown={() => setShowBoard(true)}>🏆 {t('leaderboard')}</button>
          )}
        </div>
      )}

      <button className="gol-mute" onPointerDown={toggleMute}>{muted ? '🔇' : '🔊'}</button>

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
