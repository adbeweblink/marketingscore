import type { GameEngine, VoteParams, VoteValidation, VoteData, GameUIConfig } from '@/types/game'
import type { RoundConfig } from '@/types/database'
import { registerEngine } from './types'

/** 猜謎投票制遊戲引擎（蒙面歌手用） */
const quizEngine: GameEngine = {
  type: 'quiz',

  validateVote(params: VoteParams): VoteValidation {
    const { voter_table_id, target_table_id, answer, config } = params

    if (!answer) {
      return { valid: false, error: '請選擇答案' }
    }

    // 不能猜自己桌
    if (!config.allow_self_vote && voter_table_id === target_table_id) {
      return { valid: false, error: '不能選自己的桌' }
    }

    return { valid: true }
  },

  calculateScore(votes: VoteData[]): number {
    // 猜謎模式的分數計算由 API 層根據正確答案決定
    // 這裡返回猜對的人數
    return votes.filter(v => v.answer !== null).length
  },

  getUIConfig(config: RoundConfig): GameUIConfig {
    const options = (config.options ?? []).map((opt, i) => ({
      id: `option_${i}`,
      label: opt,
    }))

    return {
      vote_ui: 'options',
      reveal_style: 'answer_reveal',
      options,
      anonymous: config.anonymous ?? true,
    }
  },
}

registerEngine(quizEngine)

export default quizEngine
