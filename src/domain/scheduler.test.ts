import { describe, expect, it } from 'vitest'
import {
  epochDay, isDue, maturity, newProgress, schedule,
  FIRST_INTERVAL, SECOND_INTERVAL, MIN_EASE, START_EASE,
} from './scheduler'

const noFuzz = (i: number) => i

describe('epochDay', () => {
  it('is stable within a local day and increments across midnight', () => {
    const tz = -180 // UTC+3
    const noon = Date.UTC(2026, 0, 10, 9, 0) // 12:00 local
    const evening = Date.UTC(2026, 0, 10, 20, 0)
    const nextMorning = Date.UTC(2026, 0, 11, 5, 0)
    expect(epochDay(noon, tz)).toBe(epochDay(evening, tz))
    expect(epochDay(nextMorning, tz)).toBe(epochDay(noon, tz) + 1)
  })
})

describe('schedule — correct progression', () => {
  it('new -> review with a 1-day interval', () => {
    const p = schedule(newProgress('c'), 'correct', 100, noFuzz)
    expect(p.state).toBe('review')
    expect(p.interval).toBe(FIRST_INTERVAL)
    expect(p.due).toBe(101)
    expect(p.lastCorrect).toBe(true)
  })
  it('review ladder 1 -> 3 -> ease multiples', () => {
    let p = schedule(newProgress('c'), 'correct', 0, noFuzz)
    p = schedule(p, 'correct', p.due, noFuzz)
    expect(p.interval).toBe(SECOND_INTERVAL) // 3
    p = schedule(p, 'correct', p.due, noFuzz)
    expect(p.interval).toBe(Math.round(SECOND_INTERVAL * START_EASE)) // 8
    p = schedule(p, 'correct', p.due, noFuzz)
    expect(p.interval).toBe(Math.round(8 * START_EASE)) // 20
  })
  it('caps the interval at 180 days', () => {
    let p = newProgress('c')
    let today = 0
    for (let i = 0; i < 12; i++) { p = schedule(p, 'correct', today, noFuzz); today = p.due }
    expect(p.interval).toBeLessThanOrEqual(180)
    expect(p.interval).toBe(180)
  })
})

describe('schedule — wrong answers', () => {
  it('failing a new card does not change ease', () => {
    const p = schedule(newProgress('c'), 'wrong', 5, noFuzz)
    expect(p.state).toBe('lapsed')
    expect(p.ease).toBe(START_EASE)
    expect(p.lapses).toBe(0)
    expect(p.due).toBe(5)
  })
  it('failing a review card lapses it and drops ease', () => {
    let p = schedule(newProgress('c'), 'correct', 0, noFuzz) // review, ease 2.5
    p = schedule(p, 'wrong', p.due, noFuzz)
    expect(p.state).toBe('lapsed')
    expect(p.lapses).toBe(1)
    expect(p.ease).toBeCloseTo(START_EASE - 0.2)
    expect(p.interval).toBe(0)
  })
  it('ease never falls below the floor', () => {
    let p = schedule(newProgress('c'), 'correct', 0, noFuzz)
    for (let i = 0; i < 20; i++) {
      p = schedule(p, 'wrong', i, noFuzz)
      p = schedule(p, 'correct', i, noFuzz)
    }
    expect(p.ease).toBeGreaterThanOrEqual(MIN_EASE)
  })
  it('a lapsed card graduates back to a 1-day interval', () => {
    let p = schedule(newProgress('c'), 'correct', 0, noFuzz)
    p = schedule(p, 'wrong', 10, noFuzz)
    p = schedule(p, 'correct', 10, noFuzz)
    expect(p.state).toBe('review')
    expect(p.interval).toBe(FIRST_INTERVAL)
  })
})

describe('isDue & maturity', () => {
  it('new cards are never due', () => {
    expect(isDue(newProgress('c'), 999)).toBe(false)
  })
  it('review card becomes due on its due day', () => {
    const p = schedule(newProgress('c'), 'correct', 0, noFuzz)
    expect(isDue(p, 0)).toBe(false)
    expect(isDue(p, p.due)).toBe(true)
  })
  it('buckets by interval', () => {
    expect(maturity(newProgress('c'))).toBe('new')
    let p = schedule(newProgress('c'), 'correct', 0, noFuzz)
    expect(maturity(p)).toBe('young')
    p = { ...p, interval: 30 }
    expect(maturity(p)).toBe('mature')
    p = schedule(p, 'wrong', 100, noFuzz)
    expect(maturity(p)).toBe('learning')
  })
})
