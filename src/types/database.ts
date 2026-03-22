export type EventStatus = 'draft' | 'active' | 'finished'
export type RoundStatus = 'pending' | 'open' | 'closed' | 'revealed'
export type RoundType = 'scoring' | 'quiz' | 'cheer' | 'custom'
export type ScoringUnit = 'table' | 'group' | 'individual'

export interface Event {
  id: string
  code: string
  name: string
  status: EventStatus
  config: EventConfig
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export interface EventConfig {
  table_count: number
  theme: 'golden' | 'dark' | 'neon' | 'custom'
  logo_url?: string
  primary_color?: string
  background_image?: string
}

export interface Table {
  id: string
  event_id: string
  number: number
  name: string | null
  created_at: string
}

export interface Group {
  id: string
  event_id: string
  name: string
  color: string | null
  table_ids: string[]
  created_at: string
}

export interface Round {
  id: string
  event_id: string
  type_id: RoundType
  seq: number
  title: string
  status: RoundStatus
  config: RoundConfig
  opened_at: string | null
  closed_at: string | null
  created_at: string
}

export interface RoundConfig {
  // 評分制
  scale_min?: number
  scale_max?: number
  aggregation?: 'average' | 'sum' | 'trimmed_mean'
  scoring_unit?: ScoringUnit

  // 猜謎制
  question?: string
  options?: string[]
  correct_answer?: string
  points_correct?: number
  points_performer?: number

  // 通用
  allow_self_vote?: boolean
  anonymous?: boolean
  timer_seconds?: number | null
}

export interface Participant {
  id: string
  event_id: string
  table_id: string
  line_user_id: string | null
  display_name: string
  avatar_url: string | null
  joined_at: string
}

export interface Vote {
  id: string
  round_id: string
  participant_id: string
  target_table_id: string | null
  target_group_id: string | null
  score: number | null
  answer: string | null
  is_valid: boolean
  created_at: string
}

export interface ResultCache {
  id: string
  round_id: string
  target_type: 'table' | 'group'
  target_id: string
  total_score: number
  vote_count: number
  rank: number | null
  metadata: Record<string, unknown>
  updated_at: string
}

export interface ScoreBoard {
  entity_type: 'table' | 'group'
  entity_id: string
  entity_name: string
  entity_number?: number
  total_score: number
  round_scores: Record<string, number>
}
