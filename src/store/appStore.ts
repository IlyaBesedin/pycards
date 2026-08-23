import { create } from 'zustand'
import bankData from '../data/bank.json'
import type { Bank, Card, Grade } from '../domain/types'
import { isCorrect } from '../domain/answer'
import { epochDay, newProgress, schedule } from '../domain/scheduler'
import {
  applyAnswer, newScoreState, outstandingDebt, type ScoreState,
} from '../domain/score'
import { pickMessage, remember } from '../domain/messages'
import { advance, buildQueue, type Filter } from '../domain/queue'
import {
  load, save, type PersistedState, type ActiveSession, importJson, exportJson,
} from './persist'

export const bank = bankData as unknown as Bank
const cardById = new Map<string, Card>(bank.cards.map((c) => [c.id, c]))

function today(): number {
  return epochDay(Date.now(), new Date().getTimezoneOffset())
}

/** Live (non-persisted) state for the session in progress. */
interface SessionRuntime {
  score: ScoreState
  recentMessages: string[]
  message: string
  /** Card ids introduced-as-new this session (to bump the daily counter once). */
  introduced: Set<string>
  correctIds: Set<string>
  wrongIds: Set<string>
  startedAt: number
}

export type Phase = 'question' | 'revealed'

interface AppState {
  persisted: PersistedState
  /** Null when not in a session. */
  runtime: SessionRuntime | null
  remaining: string[]
  phase: Phase
  /** Verdict for the current card after reveal; null before reveal. */
  verdict: { grade: Grade; typed: boolean } | null
  typedAnswer: string

  // derived helpers
  currentCard: () => Card | null
  newRemainingToday: () => number

  // actions
  startSession: (filter: Filter) => void
  continueSession: () => void
  setTypedAnswer: (v: string) => void
  reveal: (mode: 'typed' | 'self') => void
  /** In self-grade mode, set the verdict the learner chose. */
  selfGrade: (grade: Grade) => void
  /** Override the auto-verdict before committing. */
  override: (grade: Grade) => void
  /** Commit the current verdict, schedule, score, and move on. */
  next: () => void
  endSession: () => void
  updateSettings: (patch: Partial<PersistedState['settings']>) => void
  resetProgress: () => void
  exportData: () => string
  importData: (text: string) => boolean
}

function persist(state: PersistedState): PersistedState {
  save(state)
  return state
}

export const useApp = create<AppState>((set, get) => ({
  persisted: load(),
  runtime: null,
  remaining: [],
  phase: 'question',
  verdict: null,
  typedAnswer: '',

  currentCard: () => {
    const id = get().remaining[0]
    return id ? cardById.get(id) ?? null : null
  },

  newRemainingToday: () => {
    const { persisted } = get()
    const used = persisted.newIntroduced[today()] ?? 0
    return Math.max(0, persisted.settings.newPerDay - used)
  },

  startSession: (filter) => {
    const { persisted } = get()
    const built = buildQueue({
      cards: bank.cards,
      progress: persisted.progress,
      filter,
      today: today(),
      newBudget: get().newRemainingToday(),
    })
    const runtime: SessionRuntime = {
      score: newScoreState(persisted.lifetimeScore),
      recentMessages: [],
      message: '',
      introduced: new Set(),
      correctIds: new Set(),
      wrongIds: new Set(),
      startedAt: Date.now(),
    }
    const active: ActiveSession = {
      filter: filter as ActiveSession['filter'],
      remaining: built.order,
      startedAt: runtime.startedAt,
      seen: [],
    }
    set({
      runtime,
      remaining: built.order,
      phase: 'question',
      verdict: null,
      typedAnswer: '',
      persisted: persist({ ...persisted, activeSession: active }),
    })
  },

  continueSession: () => {
    const { persisted } = get()
    const active = persisted.activeSession
    if (!active) return
    set({
      runtime: {
        score: newScoreState(persisted.lifetimeScore),
        recentMessages: [],
        message: '',
        introduced: new Set(),
        correctIds: new Set(),
        wrongIds: new Set(),
        startedAt: active.startedAt,
      },
      remaining: active.remaining,
      phase: 'question',
      verdict: null,
      typedAnswer: '',
    })
  },

  setTypedAnswer: (v) => set({ typedAnswer: v }),

  reveal: (mode) => {
    const card = get().currentCard()
    if (!card) return
    if (mode === 'typed') {
      const correct = isCorrect(get().typedAnswer, card)
      set({ phase: 'revealed', verdict: { grade: correct ? 'correct' : 'wrong', typed: true } })
    } else {
      // self mode: reveal now, learner grades next
      set({ phase: 'revealed', verdict: null })
    }
  },

  selfGrade: (grade) => set({ verdict: { grade, typed: false } }),

  override: (grade) => {
    const v = get().verdict
    set({ verdict: { grade, typed: v?.typed ?? false } })
  },

  next: () => {
    const state = get()
    const card = state.currentCard()
    const runtime = state.runtime
    if (!card || !runtime || !state.verdict) return
    const grade = state.verdict.grade
    const day = today()
    const persisted = state.persisted

    // 1. Was this the card's first answer this session? (drives new-counter & stats)
    const prevProgress = persisted.progress[card.id] ?? newProgress(card.id)
    const isNewIntro = prevProgress.state === 'new' && !runtime.introduced.has(card.id)

    // 2. Scheduler.
    const nextProgress = schedule(prevProgress, grade, day)

    // 3. Score (variant B).
    const res = applyAnswer(runtime.score, card.id, grade)

    // 4. Message.
    const message = pickMessage({
      state: res.state, events: res.events, recent: runtime.recentMessages,
    })
    const recentMessages = remember(runtime.recentMessages, message)

    // 5. Daily new counter (once per newly introduced card).
    const newIntroduced = { ...persisted.newIntroduced }
    const introduced = new Set(runtime.introduced)
    if (isNewIntro) {
      newIntroduced[day] = (newIntroduced[day] ?? 0) + 1
      introduced.add(card.id)
    }

    // 6. Stats (first-try only, once per card per session).
    const stats = { ...persisted.stats, totalAnswers: persisted.stats.totalAnswers + 1 }
    const firstAnswerThisSession = !runtime.correctIds.has(card.id) && !runtime.wrongIds.has(card.id)
    if (firstAnswerThisSession) {
      stats.firstTryTotal += 1
      if (grade === 'correct') stats.firstTryCorrect += 1
    }
    const correctIds = new Set(runtime.correctIds)
    const wrongIds = new Set(runtime.wrongIds)
    if (grade === 'correct') correctIds.add(card.id)
    else wrongIds.add(card.id)

    // 7. History (dedupe by id, most recent last).
    const history = persisted.history.filter((h) => h.id !== card.id)
    history.push({ id: card.id, lastGrade: grade, at: Date.now() })

    // 8. Advance the queue.
    const cursor = advance({ remaining: state.remaining }, grade)
    const remaining = cursor.remaining
    const done = remaining.length === 0

    const nextPersisted: PersistedState = {
      ...persisted,
      progress: { ...persisted.progress, [card.id]: nextProgress },
      newIntroduced,
      lifetimeScore: res.state.lifetime,
      stats,
      history,
      activeSession: done ? null : { ...persisted.activeSession!, remaining },
    }

    set({
      runtime: { ...runtime, score: res.state, recentMessages, message, introduced, correctIds, wrongIds },
      remaining,
      phase: 'question',
      verdict: null,
      typedAnswer: '',
      persisted: persist(nextPersisted),
    })
  },

  endSession: () => {
    const persisted = get().persisted
    set({
      runtime: null,
      remaining: [],
      phase: 'question',
      verdict: null,
      typedAnswer: '',
      persisted: persist({ ...persisted, activeSession: null }),
    })
  },

  updateSettings: (patch) => {
    const persisted = get().persisted
    set({ persisted: persist({ ...persisted, settings: { ...persisted.settings, ...patch } }) })
  },

  resetProgress: () => {
    const persisted = get().persisted
    const fresh: PersistedState = {
      ...persisted,
      progress: {}, newIntroduced: {}, lifetimeScore: 0,
      stats: { totalAnswers: 0, firstTryCorrect: 0, firstTryTotal: 0 },
      history: [], activeSession: null,
    }
    set({ persisted: persist(fresh), runtime: null, remaining: [] })
  },

  exportData: () => exportJson(get().persisted),

  importData: (text) => {
    try {
      const next = importJson(text)
      set({ persisted: persist(next) })
      return true
    } catch {
      return false
    }
  },
}))

export { outstandingDebt, today }
