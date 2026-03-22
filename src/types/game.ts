import type { Round, RoundConfig, RoundType } from './database'

/** 遊戲引擎介面 — 所有遊戲模式都實作這個 */
export interface GameEngine {
  type: RoundType

  /** 驗證投票是否合法 */
  validateVote(params: VoteParams): VoteValidation

  /** 計算單一表演者/桌的分數 */
  calculateScore(votes: VoteData[]): number

  /** 取得本模式的 UI 配置 */
  getUIConfig(config: RoundConfig): GameUIConfig
}

export interface VoteParams {
  voter_table_id: string
  target_table_id?: string
  target_group_id?: string
  score?: number
  answer?: string
  config: RoundConfig
}

export interface VoteValidation {
  valid: boolean
  error?: string
}

export interface VoteData {
  score: number | null
  answer: string | null
  voter_table_id: string
}

export interface GameUIConfig {
  /** 手機端投票 UI 類型 */
  vote_ui: 'slider' | 'options' | 'cheer_button' | 'none'

  /** 大螢幕揭曉方式 */
  reveal_style: 'rank_climb' | 'answer_reveal' | 'host_announce'

  /** 滑桿範圍 */
  slider_min?: number
  slider_max?: number

  /** 選項列表（猜謎用） */
  options?: Array<{ id: string; label: string }>

  /** 是否匿名 */
  anonymous: boolean
}

/** Realtime 事件類型 */
export type RealtimeEventType =
  | 'score_update'
  | 'round_status_change'
  | 'vote_received'
  | 'command'

export interface RealtimePayload {
  type: RealtimeEventType
  round_id?: string
  data: Record<string, unknown>
}
