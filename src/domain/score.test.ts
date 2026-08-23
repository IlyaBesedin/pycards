import { describe, expect, it } from 'vitest'
import { applyAnswer, newScoreState, outstandingDebt } from './score'
import type { ScoreState } from './score'

function run(steps: Array<[string, 'correct' | 'wrong']>, start?: ScoreState) {
  let s = start ?? newScoreState()
  const deltas: number[] = []
  const allEvents: string[][] = []
  for (const [id, g] of steps) {
    const r = applyAnswer(s, id, g)
    s = r.state
    deltas.push(r.delta)
    allEvents.push(r.events)
  }
  return { s, deltas, allEvents }
}

describe('variant B — card debt', () => {
  it('first-try correct is +1', () => {
    const { s, deltas } = run([['a', 'correct']])
    expect(deltas).toEqual([1])
    expect(s.session).toBe(1)
  })

  it('miss then clear nets 0 (‑1 then +1), and clears the debt', () => {
    const { s, deltas } = run([['a', 'wrong'], ['a', 'correct']])
    expect(deltas).toEqual([-1, 1])
    expect(s.session).toBe(0)
    expect(outstandingDebt(s)).toBe(0)
  })

  it('repeated misses on the same card only cost 1', () => {
    const { s, deltas } = run([
      ['a', 'wrong'], ['a', 'wrong'], ['a', 'wrong'], ['a', 'correct'],
    ])
    expect(deltas).toEqual([-1, 0, 0, 1])
    expect(s.session).toBe(0)
  })

  it('a fully cleared hard session ends at the count of first-try cards', () => {
    // a: first try; b: missed once then cleared; c: first try
    const { s } = run([
      ['a', 'correct'], ['b', 'wrong'], ['c', 'correct'], ['b', 'correct'],
    ])
    expect(s.session).toBe(2)
    expect(outstandingDebt(s)).toBe(0)
  })

  it('correct again on an already-resolved card does nothing', () => {
    const { deltas } = run([['a', 'correct'], ['a', 'correct']])
    expect(deltas).toEqual([1, 0])
  })
})

describe('events', () => {
  it('fires first_card once', () => {
    const { allEvents } = run([['a', 'correct'], ['b', 'correct']])
    expect(allEvents[0]).toContain('first_card')
    expect(allEvents[1]).not.toContain('first_card')
  })

  it('detects crossing into the negative and recovering', () => {
    const { allEvents } = run([['a', 'wrong'], ['a', 'correct']])
    expect(allEvents[0]).toContain('cross_to_negative')
    expect(allEvents[0]).toContain('debt_opened')
    expect(allEvents[1]).toContain('debt_cleared')
    expect(allEvents[1]).toContain('hit_zero')
  })

  it('fires cross_to_positive when climbing from negative to positive', () => {
    // a wrong (-1), a correct (0), b correct (+1) => recovered then positive
    const { allEvents } = run([['a', 'wrong'], ['b', 'correct'], ['a', 'correct']])
    // last step clears debt from 0.. actually b took it to 0? recompute: -1, then b correct 0->? 
    // -1 (a wrong); b correct: not debt, +1 => 0 ; a correct clears debt +1 => 1
    expect(allEvents[2]).toContain('debt_cleared')
  })

  it('fires streak milestones', () => {
    const steps = Array.from({ length: 5 }, (_, i) => [`c${i}`, 'correct'] as [string, 'correct'])
    const { allEvents } = run(steps)
    expect(allEvents[2]).toContain('streak_3')
    expect(allEvents[4]).toContain('streak_5')
  })

  it('fires wrong_streak_3', () => {
    const { allEvents } = run([['a', 'wrong'], ['b', 'wrong'], ['c', 'wrong']])
    expect(allEvents[2]).toContain('wrong_streak_3')
  })

  it('fires a milestone when session score reaches 10', () => {
    const steps = Array.from({ length: 10 }, (_, i) => [`c${i}`, 'correct'] as [string, 'correct'])
    const { allEvents } = run(steps)
    expect(allEvents[9]).toContain('milestone_10')
  })
})

describe('lifetime', () => {
  it('accumulates across the same deltas', () => {
    const { s } = run([['a', 'correct'], ['b', 'wrong'], ['b', 'correct']], newScoreState(40))
    expect(s.lifetime).toBe(41)
  })
})
