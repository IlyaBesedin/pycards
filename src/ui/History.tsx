import { useMemo, useState } from 'react'
import { bank, useApp } from '../store/appStore'
import { CodeBlock } from './CodeBlock'
import type { Card } from '../domain/types'

const cardById = new Map<string, Card>(bank.cards.map((c) => [c.id, c]))

export function History({ onExit }: { onExit: () => void }) {
  const history = useApp((s) => s.persisted.history)
  const [tab, setTab] = useState<'correct' | 'wrong'>('wrong')
  const [open, setOpen] = useState<string | null>(null)

  const items = useMemo(
    () => history.filter((h) => h.lastGrade === tab).slice().reverse(),
    [history, tab],
  )

  return (
    <div className="app">
      <div className="topbar">
        <button className="iconbtn" onClick={onExit}>Back</button>
        <h1 style={{ marginLeft: 8 }}>History</h1>
      </div>
      <div className="content">
        <div className="tabs">
          <button aria-selected={tab === 'wrong'} onClick={() => setTab('wrong')}>
            Wrong ({history.filter((h) => h.lastGrade === 'wrong').length})
          </button>
          <button aria-selected={tab === 'correct'} onClick={() => setTab('correct')}>
            Correct ({history.filter((h) => h.lastGrade === 'correct').length})
          </button>
        </div>

        {items.length === 0 && <div className="empty">No {tab} cards yet.</div>}

        <div className="histlist">
          {items.map((h) => {
            const card = cardById.get(h.id)
            if (!card) return null
            const topic = bank.topics.find((t) => t.n === card.topic)
            const isOpen = open === h.id
            return (
              <div key={h.id} className="histitem" onClick={() => setOpen(isOpen ? null : h.id)}>
                <div className="top">
                  <span className={'badge ' + h.lastGrade}>{h.lastGrade}</span>
                  <span>{topic ? topic.titleEn : `Topic ${card.topic}`}</span>
                </div>
                {!isOpen && <pre>{card.code.split('\n').slice(0, 2).join('\n')}{card.code.includes('\n') ? '\n…' : ''}</pre>}
                {isOpen && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }} onClick={(e) => e.stopPropagation()}>
                    <div className="question">{card.question}</div>
                    <CodeBlock code={card.code} />
                    <div className="answerbox">
                      <div className="label">Answer</div>
                      <div className="val">{card.answer}</div>
                    </div>
                    <div className="explanation" dangerouslySetInnerHTML={{ __html: renderExplanation(card.explanation) }} />
                    {topic && <a className="topicref" href={topic.url} target="_blank" rel="noreferrer">Open in Notion ↗</a>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function renderExplanation(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/`([^`]+)`/g, '<code>$1</code>')
}
