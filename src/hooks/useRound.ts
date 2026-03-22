'use client'

import { create } from 'zustand'
import type { Round, RoundStatus } from '@/types/database'

interface RoundState {
  /** 當前回合 */
  currentRound: Round | null

  /** 所有回合 */
  rounds: Round[]

  /** 投票倒數秒數 */
  countdown: number | null

  /** 設定當前回合 */
  setCurrentRound: (round: Round | null) => void

  /** 設定所有回合 */
  setRounds: (rounds: Round[]) => void

  /** 更新回合狀態 */
  updateRoundStatus: (roundId: string, status: RoundStatus) => void

  /** 設定倒數 */
  setCountdown: (seconds: number | null) => void

  /** 倒數 -1 */
  tick: () => void
}

export const useRoundStore = create<RoundState>((set) => ({
  currentRound: null,
  rounds: [],
  countdown: null,

  setCurrentRound: (round) => set({ currentRound: round }),

  setRounds: (rounds) => set({ rounds }),

  updateRoundStatus: (roundId, status) =>
    set((state) => {
      const updated = state.rounds.map((r) =>
        r.id === roundId ? { ...r, status } : r
      )
      const current =
        state.currentRound?.id === roundId
          ? { ...state.currentRound, status }
          : state.currentRound

      return { rounds: updated, currentRound: current }
    }),

  setCountdown: (seconds) => set({ countdown: seconds }),

  tick: () =>
    set((state) => ({
      countdown: state.countdown !== null ? Math.max(0, state.countdown - 1) : null,
    })),
}))
