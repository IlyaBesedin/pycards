import { describe, expect, it } from 'vitest'
import { isCorrect, normalize } from './answer'
import type { Card } from './types'

function card(partial: Partial<Card>): Card {
  return {
    id: 'b1-000-01', topic: 0, block: 1, difficulty: 'basic',
    kind: 'output', question: 'q', code: 'x', answer: '', accepted: [],
    explanation: 'e', tags: [], verify: 'exec', ...partial,
  }
}

describe('normalize', () => {
  it('unifies quotes and comma spacing', () => {
    expect(normalize("['a','b']")).toBe('["a", "b"]')
    expect(normalize('[1,2,3]')).toBe('[1, 2, 3]')
  })
  it('collapses whitespace but keeps newlines', () => {
    expect(normalize('  a   b ')).toBe('a b')
    expect(normalize('a\n b')).toBe('a\nb')
  })
  it('normalizes dict colon spacing', () => {
    expect(normalize("{'a':1}")).toBe('{"a": 1}')
  })
})

describe('isCorrect — output', () => {
  const c = card({ kind: 'output', answer: "['a', 'bb', 'ccc']" })
  it('accepts quote and spacing variants', () => {
    expect(isCorrect('["a", "bb", "ccc"]', c)).toBe(true)
    expect(isCorrect("['a','bb','ccc']", c)).toBe(true)
  })
  it('rejects a genuinely different value', () => {
    expect(isCorrect("['A', 'BB', 'CCC']", c)).toBe(false)
  })
  it('keeps 1 and 1.0 distinct', () => {
    expect(isCorrect('1.0', card({ answer: '1' }))).toBe(false)
  })
  it('keeps list and tuple distinct', () => {
    expect(isCorrect('(1, 2)', card({ answer: '[1, 2]' }))).toBe(false)
  })
})

describe('isCorrect — exception', () => {
  const c = card({ kind: 'exception', answer: 'ValueError' })
  it('matches the class name case-insensitively', () => {
    expect(isCorrect('valueerror', c)).toBe(true)
    expect(isCorrect('ValueError', c)).toBe(true)
  })
  it('ignores a trailing message', () => {
    expect(isCorrect('ValueError: invalid literal', c)).toBe(true)
  })
  it('rejects the wrong exception', () => {
    expect(isCorrect('TypeError', c)).toBe(false)
  })
  it('handles "no error" synonyms', () => {
    const ok = card({ kind: 'exception', answer: 'no error' })
    expect(isCorrect('no error', ok)).toBe(true)
    expect(isCorrect('nothing', ok)).toBe(true)
    expect(isCorrect('runs fine', ok)).toBe(true)
    expect(isCorrect('KeyError', ok)).toBe(false)
  })
})

describe('isCorrect — value / truth', () => {
  it('matches booleans case-insensitively', () => {
    expect(isCorrect('true', card({ kind: 'truth', answer: 'True' }))).toBe(true)
    expect(isCorrect('FALSE', card({ kind: 'truth', answer: 'False' }))).toBe(true)
  })
  it('requires exact repr for strings', () => {
    const c = card({ kind: 'value', answer: "'float'" })
    expect(isCorrect("'float'", c)).toBe(true)
    expect(isCorrect('float', c)).toBe(false)
  })
  it('honors accepted alternatives', () => {
    const c = card({ kind: 'value', answer: 'None', accepted: ['null'] })
    expect(isCorrect('null', c)).toBe(true)
  })
})
