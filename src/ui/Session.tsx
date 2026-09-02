import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { bank, useApp } from '../store/appStore'
import { CodeBlock } from './CodeBlock'
import type { Grade } from '../domain/types'

const CHIPS = ['None', 'True', 'False', '[]', '{}', '()', "''", ',', ':', 'Error', 'no error']

function topicOf(topicN: number) {
  return bank.topics.find((t) => t.n === topicN)
}

export function Session({ onExit }: { onExit: () => void }) {
  const card = useApp((s) => s.currentCard())
  const phase = useApp((s) => s.phase)
  const verdict = useApp((s) => s.verdict)
  const typed = useApp((s) => s.typedAnswer)
  const runtime = useApp((s) => s.runtime)
  const remaining = useApp((s) => s.remaining)
  const setTyped = useApp((s) => s.setTypedAnswer)
  const reveal = useApp((s) => s.reveal)
  const selfGrade = useApp((s) => s.selfGrade)
  const override = useApp((s) => s.override)
  const next = useApp((s) => s.next)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [selfMode, setSelfMode] = useState(false)
  const cardId = card?.id
  // The answer input is not auto-focused: the learner reads the code first and
  // taps the field themselves only when they want to type. This also keeps the
  // on-screen keyboard from popping up on every card. Reset its height per card.
  useEffect(() => {
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [cardId])

  if (!card || !runtime) {
    return <SessionSummary onExit={onExit} />
  }

  const topic = topicOf(card.topic)
  const score = runtime.score.session
  // Grow the answer field to fit multi-line answers (up to ~4 lines), then stop.
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 132) + 'px'
  }
  const insertChip = (chip: string) => {
    const el = inputRef.current
    if (!el) { setTyped(typed + chip); return }
    const start = el.selectionStart ?? typed.length
    const end = el.selectionEnd ?? typed.length
    const nextVal = typed.slice(0, start) + chip + typed.slice(end)
    setTyped(nextVal)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + chip.length
      el.setSelectionRange(pos, pos)
    })
  }

  const onReveal = () => {
    if (selfMode) reveal('self')
    else reveal('typed')
  }
  const commit = (g?: Grade) => {
    if (g) override(g)
    next()
    setSelfMode(false)
  }

  const answered = phase === 'revealed'
  const totalInQueue = remaining.length

  return (
    <div className="app">
      <div className="topbar">
        <button className="iconbtn" onClick={onExit}>Exit</button>
        <div className="rebus" key={runtime.message} aria-live="polite" aria-label="progress reaction">{runtime.message}</div>
        <span className={'score ' + (score < 0 ? 'neg' : score > 0 ? 'pos' : 'zero')}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>

      <div className="content">
        <div className="sessionbar">
          <span className="dot new" /> <span>{totalInQueue} left</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={verdict ? { opacity: 0, x: verdict.grade === 'correct' ? 200 : -200, rotate: verdict.grade === 'correct' ? 6 : -6 } : { opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="card"
          >
            {topic && (
              <a className="topicref" href={topic.url} target="_blank" rel="noreferrer">
                Block {card.block} · <b>{topic.titleEn}</b> ↗
              </a>
            )}
            <div className="question">{card.question}</div>
            <CodeBlock code={card.code} />

            {!answered && !selfMode && (
              <div className="answerwrap">
                <textarea
                  ref={inputRef}
                  className="answerinput"
                  rows={1}
                  value={typed}
                  onChange={(e) => { setTyped(e.target.value); grow(e.target) }}
                  onKeyDown={(e) => {
                    // Enter inserts a newline so multi-line answers can be typed.
                    // Submit with Cmd/Ctrl+Enter (or the Check button).
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onReveal() }
                  }}
                  placeholder="Type the answer…  (⏎ for a new line)"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="enter"
                />
                <div className="chipbar">
                  {CHIPS.map((c) => (
                    <button key={c} onClick={() => insertChip(c)} type="button">{c}</button>
                  ))}
                </div>
              </div>
            )}

            {answered && (
              <Verdict card={card} typed={typed} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="stickybottom">
        {!answered && !selfMode && (
          <div className="btnrow">
            <button className="btn ghost" onClick={() => { setSelfMode(true); reveal('self') }}>
              Show
            </button>
            <button className="btn primary" onClick={onReveal}>Check</button>
          </div>
        )}
        {answered && selfMode && !verdict && (
          <div className="btnrow">
            <button className="btn red" onClick={() => { selfGrade('wrong') }}>Didn't know</button>
            <button className="btn green" onClick={() => { selfGrade('correct') }}>Knew it</button>
          </div>
        )}
        {answered && verdict && (
          <button className="btn primary" onClick={() => commit()}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}

function Verdict({ card, typed }: { card: import('../domain/types').Card; typed: string }) {
  const verdict = useApp((s) => s.verdict)
  const override = useApp((s) => s.override)
  const grade = verdict?.grade
  const showedTyped = verdict?.typed && typed.trim().length > 0

  return (
    <div className="verdict">
      {grade && (
        <div className={'banner ' + grade}>
          {grade === 'correct' ? '✓ Correct' : '✗ Not quite'}
        </div>
      )}
      {showedTyped && grade === 'wrong' && (
        <div className="answerbox">
          <div className="label">Your answer</div>
          <div className="val yours wrong">{typed}</div>
        </div>
      )}
      <div className="answerbox">
        <div className="label">Answer</div>
        <div className="val">{card.answer}</div>
      </div>
      <div className="explanation" dangerouslySetInnerHTML={{ __html: renderExplanation(card.explanation) }} />
      {grade === 'wrong' && (
        <div className="overriderow">
          <button onClick={() => override('correct')}>Actually, I was right</button>
        </div>
      )}
    </div>
  )
}

/** Minimal, safe `code` rendering: escape HTML, then turn `x` into <code>. */
function renderExplanation(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/`([^`]+)`/g, '<code>$1</code>')
}

function SessionSummary({ onExit }: { onExit: () => void }) {
  const runtime = useApp((s) => s.runtime)
  const endSession = useApp((s) => s.endSession)
  useEffect(() => {
    // Runtime is present until endSession; show its final numbers.
    if (!runtime) onExit()
  }, [runtime, onExit])
  if (!runtime) return null
  const correct = runtime.correctIds.size
  const wrong = runtime.wrongIds.size
  const score = runtime.score.session
  return (
    <div className="app">
      <div className="content">
        <div className="summary">
          <div>Session complete</div>
          <div className="bigscore">{score > 0 ? '+' : ''}{score}</div>
          <div className="statgrid">
            <div className="stat"><div className="n">{correct}</div><div className="l">cards known</div></div>
            <div className="stat"><div className="n">{wrong}</div><div className="l">cards missed</div></div>
          </div>
          <button className="btn primary" onClick={() => { endSession(); onExit() }}>Done</button>
        </div>
      </div>
    </div>
  )
}
