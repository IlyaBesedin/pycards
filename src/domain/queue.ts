import type { Card, CardProgress, Grade } from './types'
import { isDue } from './scheduler'

/**
 * The in-session queue. It decides which cards to study and, crucially, how a
 * missed card is re-inserted: it must come back, but "not sooner than 10 other
 * cards later" (the reference behaviour is Anki's relearn steps — a card you got
 * wrong returns after a gap, not immediately).
 *
 * Session composition for a filter (block + topics + difficulty):
 *   1. relearn — cards left in learning/lapsed from an interrupted session
 *   2. due     — review cards whose due day has arrived (most overdue first)
 *   3. new     — cards never seen, in topic order, up to the remaining daily limit
 * Order: relearn -> due -> new (clear the debt before taking on new material).
 */

export const REINSERT_MIN = 10
export const REINSERT_MAX = 15
export const DUE_CAP = 200

export interface Filter {
  blocks?: number[]
  topics?: number[]
  difficulties?: Card['difficulty'][]
}

export function matchesFilter(card: Card, f: Filter): boolean {
  if (f.blocks?.length && !f.blocks.includes(card.block)) return false
  if (f.topics?.length && !f.topics.includes(card.topic)) return false
  if (f.difficulties?.length && !f.difficulties.includes(card.difficulty)) return false
  return true
}

export interface BuildInput {
  cards: Card[]
  progress: Record<string, CardProgress | undefined>
  filter: Filter
  today: number
  /** Remaining new-card allowance for today (>= 0). */
  newBudget: number
}

export interface BuiltQueue {
  /** Ordered card ids to study this session. */
  order: string[]
  counts: { relearn: number; due: number; new: number }
}

/** Build the initial ordered queue of card ids. */
export function buildQueue(input: BuildInput): BuiltQueue {
  const { cards, progress, filter, today, newBudget } = input
  const inScope = cards.filter((c) => matchesFilter(c, filter))

  const relearn: Card[] = []
  const due: Card[] = []
  const fresh: Card[] = []

  for (const card of inScope) {
    const p = progress[card.id]
    if (!p || p.state === 'new') {
      fresh.push(card)
    } else if (p.state === 'learning' || p.state === 'lapsed') {
      relearn.push(card)
    } else if (isDue(p, today)) {
      due.push(card)
    }
  }

  // Most overdue review cards first.
  due.sort((a, b) => (progress[a.id]!.due - progress[b.id]!.due) || a.topic - b.topic)
  const dueCapped = due.slice(0, DUE_CAP)

  // New cards strictly in curriculum order: topic number, then card id.
  fresh.sort((a, b) => a.topic - b.topic || a.id.localeCompare(b.id))
  const freshLimited = fresh.slice(0, Math.max(0, newBudget))

  const order = [
    ...relearn.map((c) => c.id),
    ...dueCapped.map((c) => c.id),
    ...freshLimited.map((c) => c.id),
  ]
  return {
    order,
    counts: { relearn: relearn.length, due: dueCapped.length, new: freshLimited.length },
  }
}

/**
 * Re-insert a missed card into the remaining queue. `queue` is the list of ids
 * still to be shown (not including the card just answered). The card is placed
 * REINSERT_MIN..REINSERT_MAX positions ahead; if fewer than REINSERT_MIN remain,
 * it goes to the very end; if the queue is empty, it comes back immediately.
 *
 * `rand` returns a float in [0, 1); inject a stable one in tests.
 */
export function reinsert(
  queue: string[],
  cardId: string,
  rand: () => number = Math.random,
): string[] {
  const q = [...queue]
  if (q.length === 0) return [cardId]
  if (q.length < REINSERT_MIN) {
    q.push(cardId)
    return q
  }
  const span = REINSERT_MAX - REINSERT_MIN
  const gap = REINSERT_MIN + Math.floor(rand() * (span + 1))
  const pos = Math.min(q.length, gap)
  q.splice(pos, 0, cardId)
  return q
}

/**
 * A running session cursor. `remaining` is the queue of ids not yet answered
 * (the head is the current card). On a wrong answer, the card is re-queued.
 */
export interface SessionCursor {
  remaining: string[]
}

export function advance(
  cursor: SessionCursor,
  grade: Grade,
  rand: () => number = Math.random,
): SessionCursor {
  const [current, ...rest] = cursor.remaining
  if (current === undefined) return cursor
  if (grade === 'wrong') {
    return { remaining: reinsert(rest, current, rand) }
  }
  return { remaining: rest }
}
