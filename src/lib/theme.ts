export const theme = {
  bg: '#0C1017',
  surface: '#141921',
  card: '#1B2230',
  border: '#2A3347',
  borderHi: '#4F8CFF',
  accent: '#4F8CFF',
  glow: 'rgba(79,140,255,0.12)',
  green: '#34D399',
  greenBg: 'rgba(52,211,153,0.08)',
  red: '#F87171',
  redBg: 'rgba(248,113,113,0.08)',
  yellow: '#FBBF24',
  yellowBg: 'rgba(251,191,36,0.08)',
  text: '#E2E8F0',
  muted: '#94A3B8',
  dim: '#64748B',
  white: '#FFF',
} as const;

export type Theme = typeof theme;

export function ratingColor(rating: string): string {
  const map: Record<string, string> = {
    'Strong Buy': theme.green,
    'Buy': theme.green,
    'Hold': theme.yellow,
    'Pass': theme.red,
    'Strong Pass': theme.red,
  };
  return map[rating] || theme.yellow;
}

export function fmt(v: number): string {
  return (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();
}

export function pct(v: number): string {
  return v.toFixed(2) + '%';
}
