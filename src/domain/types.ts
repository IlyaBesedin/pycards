export type CardKind = 'output' | 'exception' | 'value' | 'pytest' | 'truth'
export type VerifyMode = 'exec' | 'pytest' | 'manual'
export type Difficulty = 'basic' | 'intermediate' | 'advanced'

/** A card as authored in cards/**.json and baked into the bank. */
export interface Card {
  id: string
  topic: number
  block: number
  difficulty: Difficulty
  kind: CardKind
  question: string
  code: string
  answer: string
  accepted: string[]
  explanation: string
  tags: string[]
  verify: VerifyMode
}

export interface Topic {
  n: number
  block: number
  week: number
  difficulty: Difficulty
  title: string
  titleEn: string
  url: string
}

export interface Block {
  id: number
  name: string
  nameRu: string
  from: number
  to: number
}

export interface Bank {
  blocks: Block[]
  topics: Topic[]
  cards: Card[]
}

/** Spaced-repetition state for one card, persisted across sessions. */
export type SrsState = 'new' | 'learning' | 'review' | 'lapsed'

export interface CardProgress {
  id: string
  state: SrsState
  /** SM-2 ease factor, starts at 2.5, floored at 1.3. */
  ease: number
  /** Current interval in days (0 for new/learning). */
  interval: number
  /** Epoch day (UTC-based local day number) the card is next due. */
  due: number
  /** Times this card lapsed from review. */
  lapses: number
  /** Total reviews (any answer). */
  reps: number
  /** Epoch day of the last answer, or null if never seen. */
  lastReviewed: number | null
  /** First-try correctness on the most recent introduction, for stats. */
  lastCorrect: boolean | null
}

export type Grade = 'correct' | 'wrong'

/** Verdict shown after "Show answer", before any override. */
export interface Verdict {
  grade: Grade
  /** True when the learner typed an answer; false in "Just show me" mode. */
  typed: boolean
  /** The normalized comparison matched exactly (vs. accepted / self-graded). */
  matched: boolean
}
