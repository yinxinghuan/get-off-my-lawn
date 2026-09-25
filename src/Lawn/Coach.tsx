import { useEffect, useState } from 'react';
import type { CoachSpots } from './Scene';
import { t } from './i18n';

export type TutorStep = 'place' | 'march' | 'upgrade' | 'speed' | 'wait' | 'perk';

interface Box { x: number; y: number; w: number; h: number; }

function useTarget(selector: string, active: boolean): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!active) { setBox(null); return; }
    const read = () => {
      const el = document.querySelector(selector);
      const root = document.querySelector('.gol');
      if (!el || !root) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      const o = root.getBoundingClientRect();
      setBox({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height });
    };
    read();
    const id = window.setInterval(read, 200);
    return () => window.clearInterval(id);
  }, [selector, active]);
  return box;
}

function localPt(pt: { x: number; y: number } | null | undefined) {
  if (!pt) return null;
  const root = document.querySelector('.gol');
  if (!root) return pt;
  const o = root.getBoundingClientRect();
  return { x: pt.x - o.left, y: pt.y - o.top };
}

/** Guest night-1 coach. The dim and the arrows do not take clicks. Skip does. */
export function Coach({
  step, desk, spots, onSkip,
}: {
  step: TutorStep;
  desk: boolean;
  spots: CoachSpots | null;
  onSkip: () => void;
}) {
  const card = useTarget('.gol-card--coach', step === 'place');
  const lives = useTarget('.gol-lives', step === 'march');
  const speed = useTarget('.gol-speed', step === 'speed');
  const offers = useTarget('.gol-choice-row', step === 'perk');
  const socket = step === 'place' ? localPt(spots?.socket) : null;
  const spawn = step === 'march' ? localPt(spots?.spawn) : null;
  const tower = step === 'upgrade' ? localPt(spots?.tower) : null;
  const walk = spots?.spawnDir;
  const walkTurn = walk && (walk.x !== 0 || walk.y !== 0)
    ? Math.atan2(walk.y, walk.x) * (180 / Math.PI) - 90
    : 0;

  const copy = step === 'place'
    ? { b: t(desk ? 'tutorPlace' : 'tutorPlaceTap'), s: t('tutorKeys') }
    : step === 'march'
      ? { b: t('tutorMarch'), s: t(desk ? 'tutorMarchSub' : 'tutorMarchTap') }
      : step === 'upgrade'
        ? { b: t(desk ? 'tutorUpgrade' : 'tutorUpgradeTap'), s: t('tutorUpgradeSub') }
        : step === 'speed'
          ? { b: t('tutorSpeed'), s: '' }
          : null;

  return (
    <div className="gol-coach" aria-live="polite">
      {step === 'place' && (
        <svg className="gol-coach-dim" aria-hidden>
          <defs>
            <mask id="gol-coach-mask">
              <rect width="100%" height="100%" fill="white" />
              {socket && <circle cx={socket.x} cy={socket.y} r="48" fill="black" />}
              {card && (
                <rect x={card.x - 6} y={card.y - 6} width={card.w + 12} height={card.h + 12} rx="12" fill="black" />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(8, 2, 16, 0.58)" mask="url(#gol-coach-mask)" />
        </svg>
      )}
      {socket && (
        <>
          <i className="gol-coach-ring" style={{ left: socket.x, top: socket.y }} />
          <Pointer x={socket.x} y={socket.y - 8} />
        </>
      )}
      {card && (
        <Pointer
          x={desk ? card.x - 4 : card.x + card.w / 2}
          y={desk ? card.y + card.h / 2 : card.y - 4}
          turn={desk ? -90 : 0}
        />
      )}
      {spawn && <Pointer x={spawn.x} y={spawn.y} turn={walkTurn} label={t('tutorSpawn')} />}
      {lives && (
        <Pointer x={lives.x + lives.w + 6} y={lives.y + lives.h / 2} turn={90} label={t('tutorLives')} side />
      )}
      {tower && <Pointer x={tower.x} y={tower.y - 10} />}
      {speed && <Pointer x={speed.x - 6} y={speed.y + speed.h / 2} turn={-90} />}
      {offers && <Pointer x={offers.x + offers.w / 2} y={offers.y - 4} />}
      {copy && (
        <div className="gol-coach-card">
          <b>{copy.b}</b>
          {copy.s ? <span>{copy.s}</span> : null}
          <button type="button" className="gol-coach-skip" onPointerDown={(e) => { e.stopPropagation(); onSkip(); }}>
            {t('tutorSkip')}
          </button>
        </div>
      )}
    </div>
  );
}

function Pointer({ x, y, turn = 0, label, side = false }: { x: number; y: number; turn?: number; label?: string; side?: boolean }) {
  return (
    <div className="gol-coach-pin" style={{ left: x, top: y }}>
      <div className="gol-coach-bob">
        <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden style={{ transform: `translateX(-50%) rotate(${turn}deg)` }}>
          <path d="M18 5v16" stroke="#ffd15e" strokeWidth="4" strokeLinecap="round" />
          <path d="M8 17l10 13 10-13" fill="#ffd15e" stroke="#140814" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
      {label ? <em className={side ? 'is-side' : undefined}>{label}</em> : null}
    </div>
  );
}
