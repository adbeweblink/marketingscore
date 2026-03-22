'use client'

import { create } from 'zustand'
import type { ScoreBoard } from '@/types/database'

interface LeaderboardState {
  /** 各桌/組的積分排行 */
  entries: ScoreBoard[]

  /** 是否正在載入 */
  loading: boolean

  /** 更新排行榜 */
  setEntries: (entries: ScoreBoard[]) => void

  /** 更新單一項目的分數 */
  updateScore: (entityId: string, roundId: string, score: number) => void

  /** 重置 */
  reset: () => void
}

export const useLeaderboardStore = create<LeaderboardState>((set) => ({
  entries: [],
  loading: true,

  setEntries: (entries) =>
    set({ entries: sortByScore(entries), loading: false }),

  updateScore: (entityId, roundId, score) =>
    set((state) => {
      const updated = state.entries.map((entry) => {
        if (entry.entity_id !== entityId) return entry

        const newRoundScores = { ...entry.round_scores, [roundId]: score }
        const newTotal = Object.values(newRoundScores).reduce((a, b) => a + b, 0)

        return {
          ...entry,
          total_score: newTotal,
          round_scores: newRoundScores,
        }
      })

      return { entries: sortByScore(updated) }
    }),

  reset: () => set({ entries: [], loading: true }),
}))

function sortByScore(entries: ScoreBoard[]): ScoreBoard[] {
  return [...entries].sort((a, b) => b.total_score - a.total_score)
}
