// Custom SVG glyphs — no emoji (they render inconsistently and look crude over
// the 3D art). Bone / spectral palette to match the graveyard theme.

export function Candle({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="gol-ico gol-ico--candle" aria-hidden>
      {lit && (
        <g className="gol-flame">
          <ellipse cx="12" cy="6.4" rx="3.4" ry="4.2" fill="#ffcf7a" opacity="0.35" />
          <path d="M12 2.4c1.7 1.8 2.5 3.2 2.5 4.5a2.5 2.5 0 1 1-5 0c0-1.1.8-2.5 2.5-4.5z" fill="#ffd982" />
          <path d="M12 4.7c.9 1.1 1.3 2 1.3 2.7a1.3 1.3 0 1 1-2.6 0c0-.6.4-1.5 1.3-2.7z" fill="#fff6d6" />
        </g>
      )}
      <rect x="11.5" y="8.2" width="1" height="2.2" fill={lit ? '#5a3f22' : '#4a4e48'} />
      <rect x="8.6" y="10.2" width="6.8" height="10.6" rx="1.3" fill={lit ? '#ece3cb' : '#565a53'} />
      <rect x="8.6" y="10.2" width="2.3" height="10.6" rx="1.1" fill={lit ? '#fff8e8' : '#666b62'} />
      <rect x="7.5" y="20.2" width="9" height="2.4" rx="1.2" fill={lit ? '#c79f4d' : '#3f433f'} />
    </svg>
  );
}

export function Skull({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M12 3c4.3 0 7 2.9 7 6.8 0 2.1-.9 3.6-2 4.5v2.3c0 .8-.6 1.3-1.4 1.3h-.5v1.2c0 .6-.5 1-1.05 1s-1.05-.4-1.05-1v-1.2h-2v1.2c0 .6-.47 1-1.05 1s-1.05-.4-1.05-1v-1.2h-.5C7.6 17.9 7 17.4 7 16.6v-2.3C5.9 13.4 5 11.9 5 9.8 5 5.9 7.7 3 12 3z" fill="#d4ead9" />
      <circle cx="9.1" cy="11.1" r="1.85" fill="#0c1118" />
      <circle cx="14.9" cy="11.1" r="1.85" fill="#0c1118" />
      <path d="M12 13.2l-1.05 2.1h2.1z" fill="#0c1118" />
    </svg>
  );
}

export function Sound({ on, size = 20 }: { on: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M4 9.2h2.8L11 6v12l-4.2-3.2H4z" fill="#cfe1d6" />
      {on ? (
        <>
          <path d="M14.4 9.4a3.8 3.8 0 0 1 0 5.2" stroke="#cfe1d6" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M16.8 7.2a7 7 0 0 1 0 9.6" stroke="#cfe1d6" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <path d="M14.6 9.4l5 5.2M19.6 9.4l-5 5.2" stroke="#cfe1d6" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Finger({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M22 6.5c1.7 0 3 1.4 3 3v12.3l3.4-1c2.9-.9 5.9.4 7.3 3l3.1 5.7c.9 1.7.9 3.7-.1 5.3l-2.6 4.4c-1 1.6-2.7 2.6-4.6 2.6H24c-2.1 0-4-1.1-5.1-2.9l-6.4-10.6c-.9-1.6-.4-3.6 1.1-4.6 1.3-.8 3-.6 4 .5l1.4 1.5V9.5c0-1.6 1.3-3 3-3z" fill="#fff" stroke="#0c1414" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Tomb({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="gol-ico" aria-hidden>
      <path d="M7 21V11a5 5 0 0 1 10 0v10z" fill="#d4ead9" />
      <rect x="4.5" y="20.2" width="15" height="2.8" rx="1.2" fill="#9bab9d" />
      <rect x="11" y="12.6" width="2" height="5.2" rx="0.4" fill="#0c1118" />
      <rect x="9" y="14.2" width="6" height="2" rx="0.4" fill="#0c1118" />
    </svg>
  );
}
