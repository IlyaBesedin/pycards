import type { CardProgress } from '../domain/types'

/**
 * Versioned localStorage persistence. Everything the learner accumulates lives
 * here: per-card SRS progress, the daily new-card counter, lifetime score, and
 * settings. Kept deliberately small and JSON-serializable so export/import is a
 * single file the user can back up (Safari may evict storage after 7 idle days).
 */

export const STORAGE_KEY = 'pycards.v1'
export const SCHEMA_VERSION = 1

export interface Settings {
  newPerDay: number
  theme: 'system' | 'dark' | 'light'
}

export interface HistoryEntry {
  id: string
  /** Last grade the learner got on this card (for the History screen). */
  lastGrade: 'correct' | 'wrong'
  /** Epoch ms of the last answer. */
  at: number
}

export interface PersistedState {
  version: number
  progress: Record<string, CardProgress>
  /** epochDay -> count of new cards introduced that day. */
  newIntroduced: Record<number, number>
  lifetimeScore: number
  /** Aggregate stats. */
  stats: {
    totalAnswers: number
    firstTryCorrect: number
    firstTryTotal: number
  }
  history: HistoryEntry[]
  settings: Settings
  /** A session interrupted mid-way, so Home can offer "Continue". */
  activeSession: ActiveSession | null
}

export interface ActiveSession {
  filter: { blocks?: number[]; topics?: number[]; difficulties?: string[] }
  remaining: string[]
  startedAt: number
  /** Card ids answered correctly-first-try this session, for the summary. */
  seen: string[]
}

export const DEFAULT_SETTINGS: Settings = { newPerDay: 20, theme: 'system' }

export function emptyState(): PersistedState {
  return {
    version: SCHEMA_VERSION,
    progress: {},
    newIntroduced: {},
    lifetimeScore: 0,
    stats: { totalAnswers: 0, firstTryCorrect: 0, firstTryTotal: 0 },
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    activeSession: null,
  }
}

/** Migrate any older shape to the current one. Currently only v1 exists. */
export function migrate(raw: unknown): PersistedState {
  if (!raw || typeof raw !== 'object') return emptyState()
  const data = raw as Partial<PersistedState>
  const base = emptyState()
  return {
    ...base,
    ...data,
    version: SCHEMA_VERSION,
    progress: data.progress ?? base.progress,
    newIntroduced: data.newIntroduced ?? base.newIntroduced,
    stats: { ...base.stats, ...(data.stats ?? {}) },
    settings: { ...base.settings, ...(data.settings ?? {}) },
    history: data.history ?? base.history,
    activeSession: data.activeSession ?? null,
  }
}

export function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    return migrate(JSON.parse(raw))
  } catch {
    return emptyState()
  }
}

export function save(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage full or unavailable — non-fatal; export is the backup path
  }
}

export function exportJson(state: PersistedState): string {
  return JSON.stringify(state, null, 2)
}

export function importJson(text: string): PersistedState {
  return migrate(JSON.parse(text))
}
