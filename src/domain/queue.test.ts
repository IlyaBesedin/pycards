import { describe, expect, it } from 'vitest'
import { advance, buildQueue, matchesFilter, reinsert, REINSERT_MIN } from './queue'
import { newProgress } from './scheduler'
import type { Card, CardProgress } from './types'

function card(id: string, topic: number, block = 1, difficulty: Card['difficulty'] = 'basic'): Card {
  return {
    id, topic, block, difficulty, kind: 'output', question: 'q', code: 'x',
    answer: 'a', accepted: [], explanation: 'e', tags: [], verify: 'exec',
  }
}

describe('matchesFilter', () => {
  const c = card('b1-002-01', 2, 1, 'basic')
  it('matches on block, topic, difficulty', () => {
    expect(matchesFilter(c, {})).toBe(true)
    expect(matchesFilter(c, { blocks: [1] })).toBe(true)
    expect(matchesFilter(c, { blocks: [2] })).toBe(false)
    expect(matchesFilter(c, { topics: [2] })).toBe(true)
    expect(matchesFilter(c, { difficulties: ['advanced'] })).toBe(false)
  })
})

describe('buildQueue', () => {
  const cards = [
    card('b1-001-01', 1), card('b1-001-02', 1),
    card('b1-002-01', 2), card('b1-002-02', 2),
    card('b1-003-01', 3),
  ]
  it('orders relearn -> due -> new and respects the new budget', () => {
    const progress: Record<string, CardProgress> = {
      // b1-001-01 is a lapsed relearn card
      'b1-001-01': { ...newProgress('b1-001-01'), state: 'lapsed', due: 5 },
      // b1-002-01 is due today
      'b1-002-01': { ...newProgress('b1-002-01'), state: 'review', interval: 3, due: 5 },
      // b1-002-02 is review but not due yet
      'b1-002-02': { ...newProgress('b1-002-02'), state: 'review', interval: 10, due: 20 },
    }
    const q = buildQueue({ cards, progress, filter: {}, today: 5, newBudget: 1 })
    expect(q.counts).toEqual({ relearn: 1, due: 1, new: 1 })
    // relearn first, then due, then a single new card (lowest topic/id)
    expect(q.order[0]).toBe('b1-001-01')
    expect(q.order[1]).toBe('b1-002-01')
    expect(q.order[2]).toBe('b1-001-02') // first new by topic order
    expect(q.order).toHaveLength(3)
  })
  it('new budget of 0 yields only reviews', () => {
    const q = buildQueue({ cards, progress: {}, filter: {}, today: 0, newBudget: 0 })
    expect(q.counts.new).toBe(0)
    expect(q.order).toHaveLength(0)
  })
  it('sorts due cards most-overdue first', () => {
    const progress: Record<string, CardProgress> = {
      'b1-001-01': { ...newProgress('b1-001-01'), state: 'review', interval: 3, due: 4 },
      'b1-002-01': { ...newProgress('b1-002-01'), state: 'review', interval: 3, due: 2 },
    }
    const q = buildQueue({ cards, progress, filter: {}, today: 10, newBudget: 0 })
    expect(q.order).toEqual(['b1-002-01', 'b1-001-01'])
  })
})

describe('reinsert', () => {
  const q = Array.from({ length: 20 }, (_, i) => `c${i}`)
  it('places the card at least REINSERT_MIN ahead', () => {
    const out = reinsert(q, 'x', () => 0)
    expect(out.indexOf('x')).toBe(REINSERT_MIN)
  })
  it('respects the upper bound with rand ~1', () => {
    const out = reinsert(q, 'x', () => 0.999)
    expect(out.indexOf('x')).toBeLessThanOrEqual(15)
    expect(out.indexOf('x')).toBeGreaterThanOrEqual(REINSERT_MIN)
  })
  it('appends to the end when fewer than 10 remain', () => {
    const short = ['a', 'b', 'c']
    expect(reinsert(short, 'x', () => 0)).toEqual(['a', 'b', 'c', 'x'])
  })
  it('returns immediately when the queue is empty', () => {
    expect(reinsert([], 'x')).toEqual(['x'])
  })
})

describe('advance', () => {
  it('drops the card on correct', () => {
    const c = advance({ remaining: ['a', 'b', 'c'] }, 'correct')
    expect(c.remaining).toEqual(['b', 'c'])
  })
  it('re-queues the card on wrong', () => {
    const long = Array.from({ length: 12 }, (_, i) => `c${i}`)
    const c = advance({ remaining: long }, 'wrong', () => 0)
    expect(c.remaining[0]).toBe('c1') // current c0 removed from head
    expect(c.remaining).toContain('c0') // and reinserted later
    expect(c.remaining.indexOf('c0')).toBeGreaterThanOrEqual(REINSERT_MIN)
  })
  it('a hard card is eventually cleared', () => {
    let cursor = { remaining: ['hard', 'a', 'b'] }
    let guard = 0
    // wrong until it lands near the end, then correct
    while (cursor.remaining[0] === 'hard' && guard++ < 5) {
      cursor = advance(cursor, 'wrong', () => 0)
    }
    // eventually 'hard' is not at the head; answer everything correctly
    guard = 0
    while (cursor.remaining.length && guard++ < 50) {
      cursor = advance(cursor, 'correct')
    }
    expect(cursor.remaining).toHaveLength(0)
  })
})
