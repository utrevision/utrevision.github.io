import OpenCC from 'opencc-js/t2cn';

const hkToCn = OpenCC.Converter({ from: 'hk', to: 'cn' });
const twToCn = OpenCC.Converter({ from: 'tw', to: 'cn' });

/** Collapse whitespace, including ideographic spaces and zero-width characters. */
function stripSpaces(text: string): string {
  return text.replace(/\s+/g, '').replace(/\u200b|\u200c|\u200d|\ufeff/g, '');
}

/**
 * Canonical form for answer matching:
 * NFKC (full-width / half-width), strip whitespace, then OpenCC to simplified
 * so traditional, simplified, and mixed script compare equally.
 */
export function normalizeAnswer(raw: string): string {
  const compact = stripSpaces(raw.normalize('NFKC'));
  return toSimplified(compact);
}

export function toSimplified(text: string): string {
  return twToCn(hkToCn(text));
}
