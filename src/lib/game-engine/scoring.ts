import type { GameEngine, VoteParams, VoteValidation, VoteData, GameUIConfig } from '@/types/game'
import type { RoundConfig } from '@/types/database'
import { registerEngine } from './types'

/** 評分制遊戲引擎 */
const scoringEngine: GameEngine = {
  type: 'scoring',

  validateVote(params: VoteParams): VoteValidation {
    const { voter_table_id, target_table_id, target_group_id, score, config } = params
    const min = config.scale_min ?? 1
    const max = config.scale_max ?? 10

    if (score === undefined || score === null) {
      return { valid: false, error: '請選擇分數' }
    }

    if (score < min || score > max) {
      return { valid: false, error: `分數必須在 ${min}~${max} 之間` }
    }

    if (!Number.isInteger(score)) {
      return { valid: false, error: '分數必須是整數' }
    }

    // 防自評
    if (!config.allow_self_vote) {
      if (config.scoring_unit === 'group' && target_group_id) {
        // 組別模式：不能評自己的組（由 API 層處理）
      } else if (target_table_id && voter_table_id === target_table_id) {
        return { valid: false, error: '不能評自己的桌' }
      }
    }

    return { valid: true }
  },

  calculateScore(votes: VoteData[]): number {
    if (votes.length === 0) return 0

    const scores = votes
      .map(v => v.score)
      .filter((s): s is number => s !== null)

    if (scores.length === 0) return 0

    // 預設用平均
    const sum = scores.reduce((a, b) => a + b, 0)
    return Math.round((sum / scores.length) * 10) / 10
  },

  getUIConfig(config: RoundConfig): GameUIConfig {
    return {
      vote_ui: 'slider',
      reveal_style: 'rank_climb',
      slider_min: config.scale_min ?? 1,
      slider_max: config.scale_max ?? 10,
      anonymous: config.anonymous ?? true,
    }
  },
}

registerEngine(scoringEngine)

export default scoringEngine
