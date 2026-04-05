'use client'

import { create } from 'zustand'
import type { ScoreBoard } from '@/types/database'

interface LeaderboardState {
  entries: ScoreBoard[]
  loading: boolean
  _updateTimer: ReturnType<typeof setTimeout> | null
  _pendingUpdates: Map<string, { roundId: string; score: number }>
  setEntries: (entries: ScoreBoard[]) => void
  updateScore: (entityId: string, roundId: string, score: number) => void
  reset: () => void
}

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
  entries: [],
  loading: true,
  _updateTimer: null,
  _pendingUpdates: new Map(),

  setEntries: (entries) =>
    set({ entries: sortByScore(entries), loading: false }),

  updateScore: (entityId, roundId, score) => {
    const state = get()
    state._pendingUpdates.set(entityId, { roundId, score })

    if (state._updateTimer) clearTimeout(state._updateTimer)
    const timer = setTimeout(() => {
      const { _pendingUpdates } = get()
      set((s) => {
        let updated = [...s.entries]
        for (const [eid, { roundId: rid, score: sc }] of _pendingUpdates) {
          updated = updated.map((entry) => {
            if (entry.entity_id !== eid) return entry
            const newRoundScores = { ...entry.round_scores, [rid]: sc }
            const newTotal = Object.values(newRoundScores).reduce((a, b) => a + b, 0)
            return { ...entry, total_score: newTotal, round_scores: newRoundScores }
          })
        }
        _pendingUpdates.clear()
        return { entries: sortByScore(updated), _updateTimer: null }
      })
    }, 300)
    set({ _updateTimer: timer })
  },

  reset: () => {
    const { _updateTimer } = get()
    if (_updateTimer) clearTimeout(_updateTimer)
    set({ entries: [], loading: true, _updateTimer: null, _pendingUpdates: new Map() })
  },
}))

function sortByScore(entries: ScoreBoard[]): ScoreBoard[] {
  return [...entries].sort((a, b) => b.total_score - a.total_score)
}
