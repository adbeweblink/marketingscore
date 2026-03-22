'use client'

import { create } from 'zustand'
import type { ScoreBoard } from '@/types/database'

/** #19 fix: 批次累積分數後一次 sort */
let updateTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpdates = new Map<string, { roundId: string; score: number }>()

interface LeaderboardState {
  entries: ScoreBoard[]
  loading: boolean
  setEntries: (entries: ScoreBoard[]) => void
  updateScore: (entityId: string, roundId: string, score: number) => void
  reset: () => void
}

export const useLeaderboardStore = create<LeaderboardState>((set) => ({
  entries: [],
  loading: true,

  setEntries: (entries) =>
    set({ entries: sortByScore(entries), loading: false }),

  /** #19 fix: debounce 300ms，批次更新 */
  updateScore: (entityId, roundId, score) => {
    pendingUpdates.set(entityId, { roundId, score })

    if (updateTimer) clearTimeout(updateTimer)
    updateTimer = setTimeout(() => {
      set((state) => {
        let updated = [...state.entries]
        for (const [eid, { roundId: rid, score: s }] of pendingUpdates) {
          updated = updated.map((entry) => {
            if (entry.entity_id !== eid) return entry
            const newRoundScores = { ...entry.round_scores, [rid]: s }
            const newTotal = Object.values(newRoundScores).reduce((a, b) => a + b, 0)
            return { ...entry, total_score: newTotal, round_scores: newRoundScores }
          })
        }
        pendingUpdates.clear()
        return { entries: sortByScore(updated) }
      })
    }, 300)
  },

  reset: () => set({ entries: [], loading: true }),
}))

function sortByScore(entries: ScoreBoard[]): ScoreBoard[] {
  return [...entries].sort((a, b) => b.total_score - a.total_score)
}
