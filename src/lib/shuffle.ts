export function shuffle<T>(items: readonly T[]): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i] as T;
    next[i] = next[j] as T;
    next[j] = current;
  }
  return next;
}
