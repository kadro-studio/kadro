// Hand-drawn 24x24 stroke icon set.
const PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  stepBack: 'M6 6v12M18 6l-8.5 6 8.5 6z',
  stepFwd: 'M18 6v12M6 6l8.5 6L6 18z',
  toStart: 'M5 5v14M12 12l7-6v12zM5 12l7-6v12z',
  toEnd: 'M19 5v14M12 12l-7-6v12zM19 12l-7-6v12z',
  scissors: 'M6 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 19.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8.2 8.2L20 18M8.2 15.8L20 6',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13',
  magnet: 'M5 4h4v8a3 3 0 006 0V4h4v8a7 7 0 01-14 0zM5 8h4M15 8h4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6zM4 4l16 16',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11',
  volumeOff: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 016.7-1.4',
  text: 'M5 7V4.5h14V7M12 4.5v15M9 19.5h6',
  film: 'M4 4.5h16v15H4zM8 4.5v15M16 4.5v15M4 8.5h4M4 12h4M4 15.5h4M16 8.5h4M16 12h4M16 15.5h4',
  music: 'M9 18V5.5l10.5-2V16M9 18a3 3 0 11-6 0 3 3 0 016 0zM19.5 16a3 3 0 11-6 0 3 3 0 016 0z',
  image: 'M3.5 4.5h17v15h-17zM8.5 11a1.75 1.75 0 100-3.5 1.75 1.75 0 000 3.5zM20.5 15.5l-5-5-11 9',
  transition: 'M3 6h10v12H3zM11 6h10v12H11z',
  sparkles: 'M11 3l1.9 4.9L18 9.5l-5.1 1.6L11 16l-1.9-4.9L4 9.5l5.1-1.6zM18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  shapes: 'M7 11a4 4 0 100-8 4 4 0 000 8zM13 13h8v8h-8zM17 3l4 7h-8z',
  settings: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1',
  export: 'M12 15V3.5M7 8.5l5-5 5 5M5 14.5v4a2 2 0 002 2h10a2 2 0 002-2v-4',
  import: 'M12 3.5V15M7 10l5 5 5-5M5 19.5h14',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  save: 'M5 3.5h11l3.5 3.5v12.5a1 1 0 01-1 1h-13a1 1 0 01-1-1v-15a1 1 0 01.5-1zM8 3.5V8h7V3.5M8 20.5V14h8v6.5',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  cursor: 'M5.5 3.5l13 7.5-5.8 1.4-2.8 5.6z',
  razor: 'M4 20L17 7l2.5 2.5-13 13H4zM14 4l6 6',
  diamond: 'M12 4.5l7.5 7.5-7.5 7.5L4.5 12z',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  marker: 'M6.5 3.5h11V16L12 20.5 6.5 16z',
  fit: 'M3.5 12h17M3.5 12l4-4M3.5 12l4 4M20.5 12l-4-4M20.5 12l-4 4',
  flipH: 'M12 3v18M9 7l-5 5 5 5zM15 7l5 5-5 5z',
  flipV: 'M3 12h18M7 9l5-5 5 5zM7 15l5 5 5-5z',
  reset: 'M4.5 12a7.5 7.5 0 107.5-7.5A7.4 7.4 0 006.5 7L4.5 9.5M4.5 4.5v5h5',
  unlink: 'M10 14a4 4 0 010-5.66l3-3a4 4 0 015.66 5.66l-1.5 1.5M14 10a4 4 0 010 5.66l-3 3a4 4 0 01-5.66-5.66l1.5-1.5',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5.5M12 7.5v.5',
  keyboard: 'M3 6.5h18v11H3zM6.5 10h1M10 10h1M13.5 10h1M17 10h.5M7.5 14h9',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17v.5',
  speed: 'M12 20a8 8 0 118-8M12 12l4.5-4.5M20 20l-3-3',
  crop: 'M6 2.5V18h15.5M2.5 6H18v15.5',
  palette: 'M12 3a9 9 0 000 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 004-4c0-4.5-4-8-9-8zM7.5 12a1 1 0 100-2 1 1 0 000 2zM10 8a1 1 0 100-2 1 1 0 000 2zM15 8a1 1 0 100-2 1 1 0 000 2z',
  layers: 'M12 3.5l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
  wand: 'M4 20L16 8M14 6l4 4M18 3v3M16.5 4.5h3M20.5 9v2M19.5 10h2',
  camera: 'M3.5 8h4l1.5-2.5h6L16.5 8h4v11h-17zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  forward: 'M4 4v16M8 12h12M16 8l4 4-4 4',
  ripple: 'M8 4H5v16h3M11 12h9M17 9l3 3-3 3',
  roll: 'M12 4v16M9 8l-4 4 4 4M15 8l4 4-4 4',
  slip: 'M3 6h18v12H3zM8 12h8M10 10l-2 2 2 2M14 10l2 2-2 2',
  slide: 'M8 6h8v12H8zM2 12h4M18 12h4M4 10l-2 2 2 2M20 10l2 2-2 2',
  freeze: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
  reverse: 'M20 6v12M16 12H4M8 8l-4 4 4 4',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7',
  scopes: 'M3 4h18v16H3zM3 15l4-5 3 3 4-6 3 4 4-3',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3.5 9h17M3.5 15h17M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  playSmall: 'M8 5.5v13l10-6.5z',
  loop: 'M17 2.5l3 3-3 3M4 11V9.5a4 4 0 014-4h12M7 21.5l-3-3 3-3M20 13v1.5a4 4 0 01-4 4H4',
  pauseSmall: 'M8 5h3v14H8zM13 5h3v14h-3z',
} satisfies Record<string, string>;

const FILLED = new Set<string>(['play', 'pause', 'stepBack', 'stepFwd', 'toStart', 'toEnd']);

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className, filled }: { name: IconName; size?: number; className?: string; filled?: boolean }) {
  const fill = filled ?? FILLED.has(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={fill ? 0.6 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
