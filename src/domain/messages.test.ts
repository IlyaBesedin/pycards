import { describe, expect, it } from 'vitest'
import { bucketOf, pickMessage, remember } from './messages'
import { applyAnswer, newScoreState } from './score'
import messagesData from '../data/messages.en.json'

describe('bucketOf', () => {
  it('maps scores to buckets', () => {
    expect(bucketOf(-5)).toBe('deep_negative')
    expect(bucketOf(-1)).toBe('negative')
    expect(bucketOf(0)).toBe('zero')
    expect(bucketOf(3)).toBe('low')
    expect(bucketOf(7)).toBe('mid')
    expect(bucketOf(20)).toBe('high')
  })
})

describe('message pool', () => {
  it('has enough lines and no empty texts', () => {
    expect(messagesData.length).toBeGreaterThanOrEqual(100)
    for (const m of messagesData as Array<{ text: string }>) {
      expect(m.text.trim().length).toBeGreaterThan(0)
    }
  })
  it('covers every bucket', () => {
    const buckets = new Set((messagesData as Array<{ bucket?: string }>).map((m) => m.bucket).filter(Boolean))
    for (const b of ['deep_negative', 'negative', 'zero', 'low', 'mid', 'high']) {
      expect(buckets.has(b)).toBe(true)
    }
  })
  it('every message is an emoji rebus of 1–5 visible symbols', () => {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
    for (const m of messagesData as Array<{ text: string }>) {
      const graphemes = [...seg.segment(m.text)].map((s) => s.segment).filter((g) => g.trim().length)
      expect(graphemes.length, m.text).toBeGreaterThanOrEqual(1)
      expect(graphemes.length, m.text).toBeLessThanOrEqual(5)
      // no plain ASCII letters/digits — these are emoji, not words
      expect(/[A-Za-z0-9]/.test(m.text), m.text).toBe(false)
    }
  })
})

describe('pickMessage', () => {
  it('prefers a high-priority event over the ambient bucket', () => {
    const r = applyAnswer(newScoreState(), 'a', 'correct') // fires first_card
    const text = pickMessage({ state: r.state, events: r.events, recent: [], rand: () => 0 })
    expect(text.length).toBeGreaterThan(0)
    // first_card lines mention starting; ensure it isn't a generic bucket line
    const firstCardTexts = (messagesData as Array<{ event?: string; text: string }>)
      .filter((m) => m.event === 'first_card').map((m) => m.text)
    expect(firstCardTexts).toContain(text)
  })

  it('falls back to a bucket line when no priority event matches', () => {
    // second correct answer: events are ['correct'] only
    let s = applyAnswer(newScoreState(), 'a', 'correct').state
    const r = applyAnswer(s, 'b', 'correct')
    const text = pickMessage({ state: r.state, events: r.events.filter((e) => e !== 'correct'), recent: [], rand: () => 0 })
    expect(text.length).toBeGreaterThan(0)
  })

  it('avoids repeating a recent message when alternatives exist', () => {
    const state = { ...newScoreState(), session: 3 }
    const seen: string[] = []
    let recent: string[] = []
    for (let i = 0; i < 5; i++) {
      const text = pickMessage({ state, events: [], recent, rand: () => (i * 0.17) % 1 })
      seen.push(text)
      recent = remember(recent, text)
    }
    // Consecutive picks should differ (pool for 'low' bucket has several lines)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).not.toBe(seen[i - 1])
    }
  })

  it('always returns something even with an unknown event set', () => {
    const text = pickMessage({ state: newScoreState(), events: [], recent: [] })
    expect(text.length).toBeGreaterThan(0)
  })
})
