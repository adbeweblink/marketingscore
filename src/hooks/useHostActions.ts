'use client'

/**
 * useHostActions — 主持人控制台 action handlers
 *
 * 設計原則：
 * - 每個 action 用樂觀更新 + 錯誤回滾模式
 * - 所有狀態副作用透過 callback 回傳，不自己管理 state
 * - 與 useEventState 配合：action 完成後呼叫 syncNow() 強制同步
 */

import { useState, useCallback } from 'react'
import type { Round, RoundStatus } from '@/types/database'

// ─── 介面定義 ──────────────────────────────────────────────────────

export interface UseHostActionsOptions {
  /** 活動 UUID（admin API 用） */
  eventId: string
  /** 管理員密碼 */
  adminKey: string
  /** 目前 rounds（供 next action 找下一輪） */
  rounds: Round[]
  /** 目前 activeRoundId */
  activeRoundId: string | null
  /** 樂觀更新 rounds */
  onRoundsUpdate: (updater: (prev: Round[]) => Round[]) => void
  /** 樂觀更新 activeRound */
  onActiveRoundChange: (id: string | null) => void
  /** 投票計數歸零 */
  onVoteReset: () => void
  /** 整個活動資料重新載入（add_round / delete_round / reactivate 後） */
  onReload: () => void
  /** 設定錯誤訊息 */
  onError: (msg: string | null) => void
  /** 設定 event status */
  onEventStatusChange: (status: string) => void
}

export interface UseHostActionsReturn {
  actionLoading: boolean
  /** 開始指定回合 */
  startRound: (roundId: string) => Promise<void>
  /** 結束目前投票 */
  stopRound: () => Promise<void>
  /** 揭曉目前回合結果 */
  revealRound: () => Promise<void>
  /** 切換到下一輪並開始 */
  nextRound: () => Promise<void>
  /** 新增回合 */
  addRound: (title: string, typeId: string) => Promise<void>
  /** 刪除指定回合 */
  deleteRound: (roundId: string) => Promise<void>
  /** 結束整個活動（顯示最終排名） */
  finalize: () => Promise<void>
  /** 重新開始活動（已結束 → 重開） */
  reactivate: () => Promise<void>
  /** 切換大螢幕顯示模式 */
  setDisplayMode: (mode: string) => Promise<void>
  /** 手動調整桌次分數（cheer 回合用） */
  manualScore: (tableId: string, delta: number) => Promise<void>
  /** 觸發 30 秒倒數 */
  countdown: () => Promise<void>
}

// ─── hook 實作 ─────────────────────────────────────────────────────

export function useHostActions({
  eventId,
  adminKey,
  rounds,
  activeRoundId,
  onRoundsUpdate,
  onActiveRoundChange,
  onVoteReset,
  onReload,
  onError,
  onEventStatusChange,
}: UseHostActionsOptions): UseHostActionsReturn {
  const [actionLoading, setActionLoading] = useState(false)

  // ─── 共用 API caller ──────────────────────────────────────────
  const callRoundAPI = useCallback(
    async (
      action: string,
      roundId?: string | null,
      extraData?: Record<string, unknown>
    ): Promise<boolean> => {
      setActionLoading(true)
      try {
        const res = await fetch('/api/admin/round', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
          },
          body: JSON.stringify({
            action,
            round_id: roundId ?? activeRoundId,
            event_id: eventId,
            data: extraData,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          onError(data.error ?? '操作失敗')
          return false
        }
        return true
      } catch {
        onError('網路錯誤，請重試')
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [adminKey, activeRoundId, eventId, onError]
  )

  // ─── startRound ───────────────────────────────────────────────
  const startRound = useCallback(
    async (roundId: string) => {
      // 樂觀更新
      onActiveRoundChange(roundId)
      onRoundsUpdate((prev) =>
        prev.map((r) => (r.id === roundId ? { ...r, status: 'open' as RoundStatus } : r))
      )
      onVoteReset()

      const ok = await callRoundAPI('start', roundId)
      if (!ok) {
        // 回滾
        onRoundsUpdate((prev) =>
          prev.map((r) => (r.id === roundId ? { ...r, status: 'pending' as RoundStatus } : r))
        )
        onActiveRoundChange(null)
      }
    },
    [callRoundAPI, onActiveRoundChange, onRoundsUpdate, onVoteReset]
  )

  // ─── stopRound ────────────────────────────────────────────────
  const stopRound = useCallback(async () => {
    if (!activeRoundId) return

    onRoundsUpdate((prev) =>
      prev.map((r) => (r.id === activeRoundId ? { ...r, status: 'closed' as RoundStatus } : r))
    )

    const ok = await callRoundAPI('stop')
    if (!ok) {
      onRoundsUpdate((prev) =>
        prev.map((r) => (r.id === activeRoundId ? { ...r, status: 'open' as RoundStatus } : r))
      )
    }
  }, [activeRoundId, callRoundAPI, onRoundsUpdate])

  // ─── revealRound ──────────────────────────────────────────────
  const revealRound = useCallback(async () => {
    if (!activeRoundId) return

    onRoundsUpdate((prev) =>
      prev.map((r) => (r.id === activeRoundId ? { ...r, status: 'revealed' as RoundStatus } : r))
    )

    const ok = await callRoundAPI('reveal')
    if (!ok) {
      onRoundsUpdate((prev) =>
        prev.map((r) => (r.id === activeRoundId ? { ...r, status: 'closed' as RoundStatus } : r))
      )
    }
  }, [activeRoundId, callRoundAPI, onRoundsUpdate])

  // ─── nextRound ────────────────────────────────────────────────
  const nextRound = useCallback(async () => {
    const currentIndex = rounds.findIndex((r) => r.id === activeRoundId)
    if (currentIndex < 0 || currentIndex >= rounds.length - 1) return

    const nextR = rounds[currentIndex + 1]

    onActiveRoundChange(nextR.id)
    onRoundsUpdate((prev) =>
      prev.map((r) => (r.id === nextR.id ? { ...r, status: 'open' as RoundStatus } : r))
    )
    onVoteReset()

    const ok = await callRoundAPI('start', nextR.id)
    if (!ok) {
      onRoundsUpdate((prev) =>
        prev.map((r) => (r.id === nextR.id ? { ...r, status: 'pending' as RoundStatus } : r))
      )
      onActiveRoundChange(activeRoundId)
    }
  }, [activeRoundId, callRoundAPI, onActiveRoundChange, onRoundsUpdate, onVoteReset, rounds])

  // ─── addRound ─────────────────────────────────────────────────
  const addRound = useCallback(
    async (title: string, typeId: string) => {
      const ok = await callRoundAPI('add_round', null, { title, type_id: typeId })
      if (ok) onReload()
    },
    [callRoundAPI, onReload]
  )

  // ─── deleteRound ──────────────────────────────────────────────
  const deleteRound = useCallback(
    async (roundId: string) => {
      const ok = await callRoundAPI('delete_round', roundId)
      if (ok) onReload()
    },
    [callRoundAPI, onReload]
  )

  // ─── finalize ─────────────────────────────────────────────────
  const finalize = useCallback(async () => {
    const ok = await callRoundAPI('finalize')
    if (ok) onEventStatusChange('finished')
  }, [callRoundAPI, onEventStatusChange])

  // ─── reactivate ───────────────────────────────────────────────
  const reactivate = useCallback(async () => {
    const ok = await callRoundAPI('reactivate')
    if (ok) {
      onEventStatusChange('active')
      onReload()
    }
  }, [callRoundAPI, onEventStatusChange, onReload])

  // ─── setDisplayMode ───────────────────────────────────────────
  const setDisplayMode = useCallback(
    async (mode: string) => {
      try {
        await fetch('/api/admin/display', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
          },
          body: JSON.stringify({ event_id: eventId, display_mode: mode }),
        })
      } catch {
        // 失敗靜默忽略，下次 polling 會修正
      }
    },
    [adminKey, eventId]
  )

  // ─── manualScore ──────────────────────────────────────────────
  const manualScore = useCallback(
    async (tableId: string, delta: number) => {
      await callRoundAPI('manual_score', null, {
        table_id: tableId,
        score_delta: delta,
      })
    },
    [callRoundAPI]
  )

  // ─── countdown ────────────────────────────────────────────────
  const countdown = useCallback(async () => {
    await callRoundAPI('countdown', null, { seconds: 30 })
  }, [callRoundAPI])

  return {
    actionLoading,
    startRound,
    stopRound,
    revealRound,
    nextRound,
    addRound,
    deleteRound,
    finalize,
    reactivate,
    setDisplayMode,
    manualScore,
    countdown,
  }
}
