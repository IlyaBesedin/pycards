import { useMemo, useState } from 'react'
import { bank, useApp, today } from '../store/appStore'
import { isDue, maturity } from '../domain/scheduler'
import { matchesFilter, type Filter } from '../domain/queue'
import type { Difficulty } from '../domain/types'

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'basic', label: 'Basic' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
]

export function Home({ onStart, onOpen }: { onStart: () => void; onOpen: (v: 'history' | 'settings') => void }) {
  const persisted = useApp((s) => s.persisted)
  const startSession = useApp((s) => s.startSession)
  const continueSession = useApp((s) => s.continueSession)
  const newRemaining = useApp((s) => s.newRemainingToday())

  const [blocks, setBlocks] = useState<number[]>([])
  const [diffs, setDiffs] = useState<Difficulty[]>([])

  const day = today()
  const filter: Filter = useMemo(
    () => ({ blocks: blocks.length ? blocks : undefined, difficulties: diffs.length ? diffs : undefined }),
    [blocks, diffs],
  )

  // Per-block counts of new / due / learning for the current difficulty filter.
  const blockStats = useMemo(() => {
    const stats = new Map<number, { total: number; new: number; due: number; young: number; mature: number; learning: number }>()
    for (const b of bank.blocks) stats.set(b.id, { total: 0, new: 0, due: 0, young: 0, mature: 0, learning: 0 })
    for (const card of bank.cards) {
      if (diffs.length && !diffs.includes(card.difficulty)) continue
      const s = stats.get(card.block)!
      s.total++
      const p = persisted.progress[card.id]
      if (!p || p.state === 'new') { s.new++; continue }
      const m = maturity(p)
      if (m === 'mature') s.mature++
      else if (m === 'young') s.young++
      else s.learning++
      if (isDue(p, day)) s.due++
    }
    return stats
  }, [persisted.progress, diffs, day])

  // Totals for the current full filter (block + difficulty) to size the counters.
  const scope = useMemo(() => {
    let newCards = 0, due = 0, relearn = 0
    for (const card of bank.cards) {
      if (!matchesFilter(card, filter)) continue
      const p = persisted.progress[card.id]
      if (!p || p.state === 'new') newCards++
      else if (p.state === 'learning' || p.state === 'lapsed') relearn++
      else if (isDue(p, day)) due++
    }
    return { newCards: Math.min(newCards, newRemaining), due, relearn }
  }, [filter, persisted.progress, newRemaining, day])

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const nothingToStudy = scope.newCards + scope.due + scope.relearn === 0
  const usedToday = persisted.newIntroduced[day] ?? 0

  return (
    <div className="app">
      <div className="topbar">
        <h1>pycards</h1>
        <div className="spacer" />
        <button className="iconbtn" onClick={() => onOpen('history')}>History</button>
        <button className="iconbtn" onClick={() => onOpen('settings')}>⚙</button>
      </div>

      <div className="content">
        <div className="counters">
          <span className={'chip limit'}>New today <b>{usedToday} / {persisted.settings.newPerDay}</b></span>
          <span className="chip"><span className="dot due" /> Due <b>{scope.due}</b></span>
          {scope.relearn > 0 && <span className="chip"><span className="dot relearn" /> Relearn <b>{scope.relearn}</b></span>}
          <span className="chip">Score <b>{persisted.lifetimeScore}</b></span>
        </div>

        {persisted.activeSession && (
          <button className="btn ghost" onClick={() => { continueSession(); onStart() }}>
            Continue session · {persisted.activeSession.remaining.length} cards left
          </button>
        )}

        <div className="small muted">Blocks {blocks.length ? `(${blocks.length} selected)` : '(all)'}</div>
        <div className="blocklist">
          {bank.blocks.map((b) => {
            const s = blockStats.get(b.id)!
            const done = s.young + s.mature + s.learning
            const pct = (n: number) => (s.total ? (n / s.total) * 100 : 0)
            return (
              <button
                key={b.id}
                className="block"
                aria-pressed={blocks.includes(b.id)}
                onClick={() => toggle(blocks, b.id, setBlocks)}
              >
                <div className="row">
                  <span className="name">{b.id}. {b.name}</span>
                  <span className="count">{done}/{s.total}</span>
                </div>
                <div className="progressbar">
                  <i className="mature" style={{ width: pct(s.mature) + '%' }} />
                  <i className="young" style={{ width: pct(s.young) + '%' }} />
                  <i className="learning" style={{ width: pct(s.learning) + '%' }} />
                </div>
                <div className="row small muted">
                  <span><span className="dot new" /> {s.new} new</span>
                  <span style={{ marginLeft: 'auto' }}>{s.due} due</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="small muted">Difficulty</div>
        <div className="tabs">
          {DIFFS.map((d) => (
            <button key={d.key} aria-selected={diffs.includes(d.key)} onClick={() => toggle(diffs, d.key, setDiffs)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stickybottom">
        <div className="small muted center">
          {nothingToStudy
            ? 'Nothing due here right now — pick another block or come back later.'
            : `Starting: ${scope.newCards} new · ${scope.due} due · ${scope.relearn} relearn`}
        </div>
        <button className="btn primary" disabled={nothingToStudy} onClick={() => { startSession(filter); onStart() }}>
          Start session
        </button>
      </div>
    </div>
  )
}
