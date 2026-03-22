import type { GameEngine, VoteParams, VoteValidation, VoteData, GameUIConfig } from '@/types/game'
import type { RoundConfig } from '@/types/database'
import { registerEngine } from './types'

/** 歡呼裁決制遊戲引擎（飆高音挑戰用） */
const cheerEngine: GameEngine = {
  type: 'cheer',

  validateVote(_params: VoteParams): VoteValidation {
    // 歡呼制由主持人裁決，不需要參與者投票驗證
    return { valid: true }
  },

  calculateScore(votes: VoteData[]): number {
    // 由主持人直接給分
    if (votes.length === 0) return 0
    return votes[0].score ?? 0
  },

  getUIConfig(config: RoundConfig): GameUIConfig {
    return {
      vote_ui: 'none', // 主持人操作，參與者只看
      reveal_style: 'host_announce',
      anonymous: config.anonymous ?? false,
    }
  },
}

registerEngine(cheerEngine)

export default cheerEngine
