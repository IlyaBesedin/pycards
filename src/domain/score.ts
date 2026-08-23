import type { Grade } from './types'

/**
 * Scoring — variant B, "card debt". The problem with a naive +1/-1 per answer is
 * that a card you miss comes back inside the session (the >=10 gap rule), so one
 * hard card can be answered several times and drive the score deep negative even
 * though you ultimately learned it. Variant B scores per *card*, not per answer:
 *
 *   - first-try correct        -> +1   (you knew it)
 *   - first miss on a card      -> -1   (a debt is opened)
 *   - repeat miss, same card    ->  0   (debt already recorded)
 *   - correct on a missed card  -> +1   (debt cleared)
 *
 * So a completed session's score equals the number of cards taken first-try, and
 * is always >= 0 once every debt is cleared. A negative score literally means
 * "this many cards are still owed". Messages react to every delta, including the
 * -1 of a fresh miss and the climb back out of the red.
 */

export interface ScoreState {
  session: number
  lifetime: number
  streakCorrect: number
  streakWrong: number
  /** Card ids currently in debt (missed, not yet cleared) this session. */
  debt: Set<string>
  /** Card ids already resolved this session (first-try correct or debt cleared). */
  resolved: Set<string>
}

export type ScoreEvent =
  | 'first_card'
  | 'correct'
  | 'wrong'
  | 'debt_opened'
  | 'debt_cleared'
  | 'cross_to_negative'
  | 'cross_to_positive'
  | 'hit_zero'
  | 'recovered'
  | 'streak_3'
  | 'streak_5'
  | 'streak_10'
  | 'wrong_streak_3'
  | 'milestone_10'
  | 'milestone_25'
  | 'milestone_50'

export interface ScoreResult {
  state: ScoreState
  /** Change in session score for this answer (-1, 0, or +1). */
  delta: number
  /** Events triggered, most specific first — messages pick the best match. */
  events: ScoreEvent[]
}

export function newScoreState(lifetime = 0): ScoreState {
  return {
    session: 0, lifetime, streakCorrect: 0, streakWrong: 0,
    debt: new Set(), resolved: new Set(),
  }
}

const MILESTONES: Record<number, ScoreEvent> = {
  10: 'milestone_10', 25: 'milestone_25', 50: 'milestone_50',
}

/**
 * Apply one answer for `cardId`. Pure: returns a fresh state (with cloned sets)
 * plus the delta and the events fired, so the UI can pick a message.
 */
export function applyAnswer(prev: ScoreState, cardId: string, grade: Grade): ScoreResult {
  const debt = new Set(prev.debt)
  const resolved = new Set(prev.resolved)
  const events: ScoreEvent[] = []

  const before = prev.session
  const isFirstEverAnswer = prev.session === 0 && debt.size === 0 && resolved.size === 0
  let delta = 0

  if (grade === 'correct') {
    if (debt.has(cardId)) {
      debt.delete(cardId)
      resolved.add(cardId)
      delta = 1
      events.push('debt_cleared')
    } else if (!resolved.has(cardId)) {
      resolved.add(cardId)
      delta = 1
    } // correct again on an already-resolved card: no change
  } else {
    if (!debt.has(cardId) && !resolved.has(cardId)) {
      debt.add(cardId)
      delta = -1
      events.push('debt_opened')
    } // repeat miss, or miss after it was resolved: no change
  }

  const session = before + delta
  const lifetime = prev.lifetime + delta
  const streakCorrect = grade === 'correct' ? prev.streakCorrect + 1 : 0
  const streakWrong = grade === 'wrong' ? prev.streakWrong + 1 : 0

  events.unshift(grade === 'correct' ? 'correct' : 'wrong')
  if (isFirstEverAnswer) events.unshift('first_card')

  // Zero-crossing events (only when the score actually moved).
  if (delta !== 0) {
    if (before >= 0 && session < 0) events.push('cross_to_negative')
    if (before < 0 && session >= 0) events.push(session === 0 ? 'hit_zero' : 'recovered')
    if (before !== 0 && session === 0 && before > 0) events.push('hit_zero')
    if (before < 0 && session > 0) events.push('cross_to_positive')
  }

  // Streak events.
  if (streakCorrect === 3) events.push('streak_3')
  if (streakCorrect === 5) events.push('streak_5')
  if (streakCorrect === 10) events.push('streak_10')
  if (streakWrong === 3) events.push('wrong_streak_3')

  // Positive milestones, fired once as the session score reaches them.
  if (delta > 0 && MILESTONES[session]) events.push(MILESTONES[session]!)

  return {
    state: { session, lifetime, streakCorrect, streakWrong, debt, resolved },
    delta,
    events,
  }
}

/** Cards still owed — the session is "clear" when this is zero. */
export function outstandingDebt(s: ScoreState): number {
  return s.debt.size
}
