import type { Card } from './types'

/**
 * Answer checking. The learner types free-form text; we normalize both sides so
 * that irrelevant differences (quote style, spacing, case of literals) are
 * forgiven while meaningful differences (1 vs 1.0, list vs tuple) are not.
 */

/** Normalize a single answer string for comparison. */
export function normalize(raw: string): string {
  let s = raw.trim()
  if (s === '') return ''

  // Unify quotes so 'a' and "a" match. Do this before collapsing spaces so we
  // never merge across string literals in a way that changes meaning.
  s = s.replace(/["']/g, '"')

  // Collapse internal whitespace (including newlines within a line) to single
  // spaces, then trim again. Multi-line answers keep their line breaks.
  s = s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')

  // Space after commas and colons inside collections: [1,2] == [1, 2].
  s = s.replace(/\s*,\s*/g, ', ').replace(/\s*:\s*/g, ': ')

  return s
}

/** Lowercased form for case-insensitive keyword matching. */
function keyword(s: string): string {
  return normalize(s).toLowerCase()
}

const NO_ERROR = new Set(['no error', 'no', 'none', 'nothing', 'runs fine', 'ok', 'no exception'])

/** Does the typed answer count as "the program does not crash"? */
function meansNoError(typed: string): boolean {
  return NO_ERROR.has(keyword(typed))
}

/**
 * Compare a typed answer against a card. Returns true when they match under the
 * card's kind-specific rules. `accepted` alternatives are tried too.
 */
export function isCorrect(typed: string, card: Card): boolean {
  const candidates = [card.answer, ...card.accepted]

  if (card.kind === 'exception') {
    if (card.answer === 'no error') {
      return meansNoError(typed)
    }
    // Accept the bare class name, case-insensitive, ignoring any ": message".
    const got = keyword(typed).split(':')[0]!.trim()
    return candidates.some((c) => keyword(c).split(':')[0]!.trim() === got)
  }

  if (card.kind === 'truth' || card.kind === 'value') {
    // Booleans and None are matched case-insensitively; everything else exactly
    // (after normalization) so that 'str' vs str, or 1 vs 1.0, stays distinct.
    const n = normalize(typed)
    return candidates.some((c) => {
      const cn = normalize(c)
      if (/^(true|false|none)$/i.test(cn)) return n.toLowerCase() === cn.toLowerCase()
      return n === cn
    })
  }

  // output / pytest: normalized exact match.
  const n = normalize(typed)
  return candidates.some((c) => normalize(c) === n)
}
