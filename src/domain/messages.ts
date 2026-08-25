import type { ScoreEvent, ScoreState } from './score'
import messagesData from '../data/messages.en.json'

/**
 * Picks a short human line to show under the score after each answer. The point
 * is empathy, not bookkeeping: encourage when the score is red, celebrate when
 * it climbs, and joke on zero (a special number for programmers). Messages are
 * chosen by the current score "bucket" plus any events fired this answer, with
 * a no-repeat window so the same line doesn't show twice in a row.
 */

export type Bucket = 'deep_negative' | 'negative' | 'zero' | 'low' | 'mid' | 'high'

export interface Message {
  text: string
  /** Score bucket this line fits; omit for event-only lines. */
  bucket?: Bucket
  /** Event this line responds to; omit for ambient bucket lines. */
  event?: ScoreEvent
  weight?: number
}

const MESSAGES = messagesData as Message[]

export function bucketOf(score: number): Bucket {
  if (score <= -5) return 'deep_negative'
  if (score < 0) return 'negative'
  if (score === 0) return 'zero'
  if (score <= 4) return 'low'
  if (score <= 9) return 'mid'
  return 'high'
}

/** Events that deserve their own line over an ambient bucket message, best first. */
const EVENT_PRIORITY: ScoreEvent[] = [
  'first_card',
  'milestone_50', 'milestone_25', 'milestone_10',
  'streak_10', 'streak_5', 'streak_3',
  'cross_to_positive', 'recovered', 'hit_zero', 'cross_to_negative',
  'wrong_streak_3',
  'debt_cleared', 'debt_opened',
]

export interface PickInput {
  state: ScoreState
  events: ScoreEvent[]
  /** Recently shown message texts, most recent last. */
  recent: string[]
  rand?: () => number
}

function weightedPick(pool: Message[], rand: () => number): Message | null {
  if (pool.length === 0) return null
  const total = pool.reduce((sum, m) => sum + (m.weight ?? 1), 0)
  let r = rand() * total
  for (const m of pool) {
    r -= m.weight ?? 1
    if (r < 0) return m
  }
  return pool[pool.length - 1]!
}

const RECENT_WINDOW = 15

/**
 * Choose a message. Strategy: find the highest-priority event that has lines,
 * else fall back to the score bucket. Filter out recently shown texts unless
 * that would empty the pool.
 */
export function pickMessage(input: PickInput): string {
  const { state, events, recent } = input
  const rand = input.rand ?? Math.random
  const recentSet = new Set(recent.slice(-RECENT_WINDOW))

  const fresh = (pool: Message[]) => {
    const unseen = pool.filter((m) => !recentSet.has(m.text))
    return unseen.length ? unseen : pool
  }

  // 1. Event lines, by priority.
  for (const ev of EVENT_PRIORITY) {
    if (!events.includes(ev)) continue
    const pool = MESSAGES.filter((m) => m.event === ev)
    if (pool.length) {
      const pick = weightedPick(fresh(pool), rand)
      if (pick) return pick.text
    }
  }

  // 2. Ambient bucket line.
  const bucket = bucketOf(state.session)
  const pool = MESSAGES.filter((m) => m.bucket === bucket && !m.event)
  const pick = weightedPick(fresh(pool), rand)
  if (pick) return pick.text

  // 3. Absolute fallback.
  return state.session >= 0 ? '🙂' : '💪'
}

/** Update the recent-messages ring buffer. */
export function remember(recent: string[], text: string): string[] {
  return [...recent, text].slice(-RECENT_WINDOW)
}
