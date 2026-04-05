'use client'

/**
 * useEventState — 統一狀態機 hook
 *
 * 設計原則：
 * - 三方（控制台 / 大螢幕 / 手機）共用同一份狀態推導邏輯
 * - 純推導函式（resolveCurrentRound / resolveDisplayMode / resolvePlayPhase）
 *   不帶副作用，可獨立測試
 * - 由 useLiveSync 負責資料拉取，本 hook 負責解讀
 */

import { useState, useCallback } from 'react'
import { useLiveSync, type LiveState } from './useLiveSync'
import type { Round, Table, EventStatus, RoundStatus } from '@/types/database'

// ─── DisplayMode 定義（大螢幕用）──────────────────────────────────
export type DisplayMode = 'idle' | 'round-intro' | 'voting' | 'counting' | 'reveal' | 'final'

// ─── PlayPhase 定義（手機端用）────────────────────────────────────
export type PlayPhase = 'join' | 'waiting' | 'voting' | 'submitted' | 'result'

// ─── EventState 介面 ──────────────────────────────────────────────
export interface EventState {
  /** 活動基本資料 */
  event: { id: string; name: string; code: string; status: EventStatus } | null

  /** 全部回合 */
  rounds: Array<{
    id: string
    seq: number
    title: string
    type_id: string
    status: RoundStatus
    config: Record<string, unknown> | null
  }>

  /** 桌次列表（控制台載入後可用） */
  tables: Table[]

  /**
   * 目前進行中的回合
   * 優先順序：open > closed > revealed
   */
  currentRound: Round | null

  /** 已加入的參與人數（等於桌位數） */
  participantCount: number

  /** 目前已投票人數 */
  voteCount: number

  /**
   * 大螢幕顯示模式（自動推導或手動覆蓋）
   * 根據 currentRound 狀態 + eventStatus + manualDisplayMode 計算
   */
  displayMode: DisplayMode

  /**
   * 主持人手動設定的顯示模式
   * 'auto' 表示跟隨回合狀態（預設）
   */
  manualDisplayMode: string

  /** 載入 / 就緒 / 錯誤 */
  phase: 'loading' | 'ready' | 'error'

  /** 錯誤訊息 */
  error: string | null
}

// ─── 純推導函式 ────────────────────────────────────────────────────

/**
 * 從 rounds 清單找出「目前進行中」的回合
 * 優先順序：open > closed > revealed
 */
export function resolveCurrentRound(
  rounds: LiveState['rounds']
): LiveState['rounds'][number] | null {
  return (
    rounds.find((r) => r.status === 'open') ??
    rounds.find((r) => r.status === 'closed') ??
    rounds.find((r) => r.status === 'revealed') ??
    null
  )
}

/**
 * 大螢幕顯示模式推導
 * 優先：主持人手動設定 > 回合狀態自動推導
 */
export function resolveDisplayMode(
  currentRound: LiveState['rounds'][number] | null,
  eventStatus: string,
  manualMode: string
): DisplayMode {
  // 主持人有手動設定時，直接對應
  if (manualMode && manualMode !== 'auto') {
    const manualMap: Record<string, DisplayMode> = {
      idle: 'idle',
      'round-intro': 'round-intro',
      voting: 'voting',
      leaderboard: 'reveal',
      final: 'final',
    }
    return manualMap[manualMode] ?? 'idle'
  }

  // auto 模式：依事件 / 回合狀態推導
  if (eventStatus === 'finished') return 'final'
  if (!currentRound) return 'idle'

  switch (currentRound.status) {
    case 'open':    return 'voting'
    case 'closed':  return 'counting'
    case 'revealed': return 'reveal'
    default:        return 'idle'
  }
}

/**
 * 手機端 phase 推導（從 LiveState 推導，補充判斷用）
 * 注意：手機端的 join / submitted phase 由本地狀態控制，
 * 此函式僅用於判斷「應不應該切換到 voting / result」
 */
export function resolvePlayPhase(
  rounds: LiveState['rounds'],
  currentLocalPhase: PlayPhase
): { shouldVote: boolean; shouldResult: boolean } {
  const openRound = rounds.find((r) => r.status === 'open')
  const revealedRound = rounds.find((r) => r.status === 'revealed')

  return {
    // 有 open 回合，且目前不在 voting
    shouldVote: !!openRound && currentLocalPhase !== 'voting',
    // 有 revealed 回合，且目前在 voting 或 submitted
    shouldResult:
      !!revealedRound &&
      (currentLocalPhase === 'voting' || currentLocalPhase === 'submitted'),
  }
}

// ─── useEventState hook ────────────────────────────────────────────

export interface UseEventStateOptions {
  /** 活動代碼（6 位英數） */
  eventCode: string
  /** 是否啟用 polling（預設 true） */
  enabled?: boolean
  /** polling 間隔 ms（預設 1000） */
  intervalMs?: number
  /**
   * 初始的 manualDisplayMode，通常從 LiveState 同步後更新
   * 預設 'auto'
   */
  initialManualMode?: string
}

export interface UseEventStateReturn {
  state: EventState
  /** 手動立即觸發一次 poll */
  syncNow: () => void
  /** 更新 manualDisplayMode（控制台切換模式後呼叫） */
  setManualDisplayMode: (mode: string) => void
  /** 更新 tables（控制台初始載入後呼叫） */
  setTables: (tables: Table[]) => void
}

export function useEventState({
  eventCode,
  enabled = true,
  intervalMs = 1000,
  initialManualMode = 'auto',
}: UseEventStateOptions): UseEventStateReturn {
  const [state, setState] = useState<EventState>({
    event: null,
    rounds: [],
    tables: [],
    currentRound: null,
    participantCount: 0,
    voteCount: 0,
    displayMode: 'idle',
    manualDisplayMode: initialManualMode,
    phase: 'loading',
    error: null,
  })

  // 讓 setTables 可以從外部更新（控制台需要）
  const setTables = useCallback((tables: Table[]) => {
    setState((prev) => ({ ...prev, tables }))
  }, [])

  const setManualDisplayMode = useCallback((mode: string) => {
    setState((prev) => ({
      ...prev,
      manualDisplayMode: mode,
      displayMode: resolveDisplayMode(
        // 用目前的 currentRound 重新推導
        prev.rounds.find(
          (r) =>
            r.id === prev.currentRound?.id
        ) ?? null,
        prev.event?.status ?? 'active',
        mode
      ),
    }))
  }, [])

  const handleRoundChange = useCallback((data: LiveState) => {
    const apiManualMode = data.display_mode ?? 'auto'
    const currentRound = resolveCurrentRound(data.rounds)
    const displayMode = resolveDisplayMode(currentRound, data.event_status, apiManualMode)

    setState((prev) => ({
      ...prev,
      rounds: data.rounds.map((r) => ({
        ...r,
        status: r.status as RoundStatus,
      })),
      // 將 currentRound 轉為完整 Round 型別（補齊缺欄位）
      currentRound: currentRound
        ? ({
            id: currentRound.id,
            event_id: prev.event?.id ?? '',
            type_id: currentRound.type_id as Round['type_id'],
            seq: currentRound.seq,
            title: currentRound.title,
            status: currentRound.status as Round['status'],
            config: (currentRound.config ?? {}) as Round['config'],
            opened_at: null,
            closed_at: null,
            created_at: '',
          } satisfies Round)
        : null,
      participantCount: data.participant_count,
      voteCount: data.vote_count,
      displayMode,
      manualDisplayMode: apiManualMode,
      phase: 'ready',
      error: null,
    }))
  }, [])

  const handleVoteProgress = useCallback((voted: number, total: number) => {
    setState((prev) => ({
      ...prev,
      voteCount: voted,
      participantCount: total,
    }))
  }, [])

  const { syncNow } = useLiveSync(eventCode, handleRoundChange, handleVoteProgress, {
    enabled,
    intervalMs,
  })

  return { state, syncNow, setManualDisplayMode, setTables }
}
