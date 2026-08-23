import type { CardProgress, Grade } from './types'

/**
 * SM-2 "lite": a binary-grade adaptation of Anki's scheduler. There are only two
 * grades — `correct` (Good) and `wrong` (Again) — so the ease steps are simpler
 * than full SM-2, but the shape is the same: correct answers grow the interval by
 * the ease factor, a wrong answer on a mature card is a lapse that resets it.
 *
 * Everything here is pure: given a progress record, a grade and today's epoch day,
 * it returns the next progress record. No dates, no storage, no randomness beyond
 * a caller-supplied fuzz function (kept injectable so tests are deterministic).
 */

export const START_EASE = 2.5
export const MIN_EASE = 1.3
export const EASE_PENALTY = 0.2
export const FIRST_INTERVAL = 1
export const SECOND_INTERVAL = 3
export const MAX_INTERVAL = 180

/** Epoch day for a timestamp in the local timezone (day number since 1970). */
export function epochDay(now: number, tzOffsetMinutes: number): number {
  return Math.floor((now - tzOffsetMinutes * 60_000) / 86_400_000)
}

export function newProgress(id: string): CardProgress {
  return {
    id, state: 'new', ease: START_EASE, interval: 0, due: 0,
    lapses: 0, reps: 0, lastReviewed: null, lastCorrect: null,
  }
}

/** Deterministic default fuzz: ±5% based on the interval itself (no RNG). */
export function defaultFuzz(interval: number): number {
  if (interval < 3) return interval
  const spread = Math.max(1, Math.round(interval * 0.05))
  // Alternate +/- by parity so repeated intervals don't all drift one way.
  return interval + (interval % 2 === 0 ? spread : -spread)
}

function clampInterval(days: number): number {
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(days)))
}

/**
 * Apply one answer. `today` is an epoch day (see epochDay). `fuzz` is applied to
 * review intervals only; pass a stable function in tests.
 */
export function schedule(
  prev: CardProgress,
  grade: Grade,
  today: number,
  fuzz: (interval: number) => number = defaultFuzz,
): CardProgress {
  const reps = prev.reps + 1
  const base = { ...prev, reps, lastReviewed: today }

  if (grade === 'wrong') {
    const lapsing = prev.state === 'review'
    return {
      ...base,
      state: 'lapsed',
      lapses: prev.lapses + (lapsing ? 1 : 0),
      // Only a mature card loses ease; failing a new/learning card does not.
      ease: lapsing ? Math.max(MIN_EASE, prev.ease - EASE_PENALTY) : prev.ease,
      interval: 0,
      due: today,
      lastCorrect: false,
    }
  }

  // grade === 'correct'
  if (prev.state === 'new') {
    return { ...base, state: 'review', interval: FIRST_INTERVAL, due: today + FIRST_INTERVAL, lastCorrect: true }
  }
  if (prev.state === 'learning' || prev.state === 'lapsed') {
    // Graduating (back) into review after a miss: restart the interval ladder.
    return { ...base, state: 'review', interval: FIRST_INTERVAL, due: today + FIRST_INTERVAL, lastCorrect: prev.lastCorrect ?? true }
  }
  // Already in review: step up.
  const next = prev.interval <= FIRST_INTERVAL
    ? SECOND_INTERVAL
    : clampInterval(prev.interval * prev.ease)
  const fuzzed = clampInterval(fuzz(next))
  return { ...base, state: 'review', interval: fuzzed, due: today + fuzzed, lastCorrect: true }
}

/** Is this card due for review on `today`? New cards are never "due" (they are gated by the daily limit). */
export function isDue(p: CardProgress, today: number): boolean {
  if (p.state === 'new') return false
  return p.due <= today
}

/** Anki-style maturity buckets for stats. */
export function maturity(p: CardProgress): 'new' | 'learning' | 'young' | 'mature' {
  if (p.state === 'new') return 'new'
  if (p.state === 'learning' || p.state === 'lapsed') return 'learning'
  return p.interval >= 21 ? 'mature' : 'young'
}
