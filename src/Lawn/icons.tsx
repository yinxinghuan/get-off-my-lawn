// Custom SVG glyphs — no emoji. All share one colour system (see palette.ts):
// BONE body + a single rule-based accent, so the set reads as designed, cohesive.
import { C } from './palette';

export function Candle({ lit }: { lit: boolean }) {
  const body = lit ? C.bone : '#54584f';
  const edge = lit ? '#f1ead4' : '#646961';
  return (
    <svg viewBox="0 0 24 24" className="gol-ico gol-ico--candle" aria-hidden>
      <path d="M8.6 8.6h6.8v10.8a1.6 1.6 0 0 1-1.6 1.6h-3.6a1.6 1.6 0 0 1-1.6-1.6z" fill={body} />
      <path d="M8.6 8.6h2.1V21h-0.5a1.6 1.6 0 0 1-1.6-1.6z" fill={edge} />
      <rect x="11.3" y="6.6" width="1.4" height="2.2" rx="0.6" fill={lit ? '#3a2e1c' : '#454942'} />
      {lit && <path d="M12 1.6c1.7 1.8 2.5 3.2 2.5 4.4a2.5 2.5 0 0 1-5 0c0-1.2.8-2.6 2.5-4.4z" fill={C.gold} />}
    </svg>
  );
}

export function Skull({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M12 3c4.3 0 7 2.9 7 6.8 0 2.1-.9 3.6-2 4.5v2.3c0 .8-.6 1.3-1.4 1.3h-.5v1.2c0 .6-.5 1-1.05 1s-1.05-.4-1.05-1v-1.2h-2v1.2c0 .6-.47 1-1.05 1s-1.05-.4-1.05-1v-1.2h-.5C7.6 17.9 7 17.4 7 16.6v-2.3C5.9 13.4 5 11.9 5 9.8 5 5.9 7.7 3 12 3z" fill={C.bone} />
      <circle cx="9.1" cy="11.1" r="1.85" fill={C.ink} />
      <circle cx="14.9" cy="11.1" r="1.85" fill={C.ink} />
      <path d="M12 13.2l-1.05 2.1h2.1z" fill={C.ink} />
    </svg>
  );
}

export function Sound({ on, size = 20 }: { on: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M4 9.2h2.8L11 6v12l-4.2-3.2H4z" fill={C.bone} />
      {on ? (
        <>
          <path d="M14.4 9.4a3.8 3.8 0 0 1 0 5.2" stroke={C.bone} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M16.8 7.2a7 7 0 0 1 0 9.6" stroke={C.bone} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <path d="M14.6 9.4l5 5.2M19.6 9.4l-5 5.2" stroke={C.blood} strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Flame({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M13 2.5c.7 2.7-.4 4.5-1.9 6.1-1.5 1.6-3.3 3-3.3 5.9a5.2 5.2 0 0 0 10.4 0c0-2-.9-3.6-1.8-4.9-.4 1-1.1 1.6-2 1.9.9-2.6.2-5.6-1.4-9z" fill={C.ember} />
      <path d="M12 11.5c1 1.3 1.6 2.4 1.6 3.5a1.7 1.7 0 0 1-3.4 0c0-1 .8-2.1 1.8-3.5z" fill="#ffd9a0" />
    </svg>
  );
}

export function Frost({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <g stroke={C.frost} strokeWidth="1.7" strokeLinecap="round">
        <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
        <path d="M12 6.4l2-2M12 6.4l-2-2M12 17.6l2 2M12 17.6l-2 2" />
        <path d="M6.7 8.9l-2.7.2M6.7 8.9l.2-2.7M17.3 15.1l2.7-.2M17.3 15.1l-.2 2.7" />
        <path d="M6.7 15.1l-.2 2.7M6.7 15.1l-2.7-.2M17.3 8.9l.2-2.7M17.3 8.9l2.7.2" />
      </g>
    </svg>
  );
}

export function Burst({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M12 2l2.1 5.2 5.4-1.6-2.7 4.9 4.2 3.6-5.6.5.8 5.6L12 22l-4.2-3.3.8-5.6-5.6-.5 4.2-3.6L4.5 5.6 9.9 7.2z" fill={C.haunt} />
      <circle cx="12" cy="12" r="2.4" fill="#efe0ff" />
    </svg>
  );
}

export function Bolt({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M13.4 2L5 13.2h5.1L9 22l9.4-12.3h-5.3z" fill={C.storm} stroke="#a98a14" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

export function Venom({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M12 2.5c3.4 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.6-6.8 6-11z" fill={C.venom} />
      <circle cx="9.8" cy="12.4" r="1.5" fill="#1d3b10" />
      <circle cx="14" cy="14.4" r="1.1" fill="#1d3b10" />
    </svg>
  );
}

export function Lock({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke={C.boneD} strokeWidth="1.9" strokeLinecap="round" />
      <rect x="5.5" y="10" width="13" height="9.5" rx="2" fill={C.boneD} />
      <circle cx="12" cy="14.2" r="1.5" fill={C.ink} />
      <rect x="11.2" y="14.6" width="1.6" height="3" rx="0.7" fill={C.ink} />
    </svg>
  );
}

export function Crown({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M3 7.5l4 3.2L12 4l5 6.7 4-3.2-1.6 11H4.6z" fill={C.gold} stroke={C.goldD} strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="4.4" y="18.6" width="15.2" height="2.4" rx="1" fill={C.gold} />
    </svg>
  );
}

export function Finger({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M22 6.5c1.7 0 3 1.4 3 3v12.3l3.4-1c2.9-.9 5.9.4 7.3 3l3.1 5.7c.9 1.7.9 3.7-.1 5.3l-2.6 4.4c-1 1.6-2.7 2.6-4.6 2.6H24c-2.1 0-4-1.1-5.1-2.9l-6.4-10.6c-.9-1.6-.4-3.6 1.1-4.6 1.3-.8 3-.6 4 .5l1.4 1.5V9.5c0-1.6 1.3-3 3-3z" fill={C.bone} stroke={C.ink} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Tomb({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M7 21V11a5 5 0 0 1 10 0v10z" fill={C.bone} />
      <rect x="4.5" y="20.2" width="15" height="2.8" rx="1.2" fill={C.boneD} />
      <rect x="11" y="12.6" width="2" height="5.2" rx="0.4" fill={C.ink} />
      <rect x="9" y="14.2" width="6" height="2" rx="0.4" fill={C.ink} />
    </svg>
  );
}
