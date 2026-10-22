export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '0';
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function formatPercent(score: number, total: number): string {
  if (total <= 0 || !Number.isFinite(score)) return '0%';
  const rounded = Math.round((score / total) * 1000) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function formatHitRate(score: number, total: number): string {
  return `${formatScore(score)} / ${total}（${formatPercent(score, total)}）`;
}

/** Full credit or not. Anything short of a whole mark is 錯. */
export function verdictOf(score: number): '對' | '錯' {
  if (score + 1e-9 >= 1) return '對';
  return '錯';
}

/**
 * Question verdict against that item's own maximum.
 * Gloss items are out of 1, so this matches verdictOf. A partial total is 錯.
 */
export function itemVerdict(score: number, max: number): '對' | '錯' {
  if (!(max > 0) || !(score > 0)) return '錯';
  if (score + 1e-9 >= max) return '對';
  return '錯';
}

/** Elapsed time as mm:ss. Minutes may exceed 59. */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatFinished(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
