'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface LiveState {
  current_round_id: string | null
  current_round_status: 'pending' | 'open' | 'closed' | 'revealed' | null
  current_round_title: string | null
  current_round_seq: number | null
  current_round_type: string | null
  current_round_config: Record<string, unknown> | null
  vote_count: number
  participant_count: number
  votes_per_person?: number
  /** 最近 30 秒內完成投票的用戶名字列表（open 回合時才有，最多 30 筆） */
  recent_voters?: string[]
  event_status: string
  /** 主持人手動設定的大螢幕顯示模式，'auto' 或未設定 = 跟隨回合狀態 */
  display_mode?: string
  /** 倒數計時結束時間（ISO string），null = 無倒數 */
  countdown_end?: string | null
  rounds: Array<{
    id: string
    seq: number
    title: string
    type_id: string
    status: 'pending' | 'open' | 'closed' | 'revealed'
    config: Record<string, unknown> | null
  }>
}

/**
 * 共用 1 秒 polling hook，取代 Supabase Realtime WebSocket
 *
 * 設計原則：
 * - 每秒 polling /api/events/[code]/live
 * - 對比上一次狀態，只在變化時才觸發 callback（避免不必要的 re-render）
 * - 用 round_id + status + vote_count 組合做 change detection
 * - 內建指數退避：連續失敗時放慢 polling 頻率（最多 5 秒）
 */
export function useLiveSync(
  eventCode: string,
  onRoundChange: (data: LiveState) => void,
  onVoteProgress: (voted: number, total: number, votesPerPerson?: number) => void,
  options?: { enabled?: boolean; intervalMs?: number },
  onVotersUpdate?: (voters: string[]) => void
) {
  const { enabled = true, intervalMs = 1000 } = options ?? {}

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastStateRef = useRef<string>('')
  const lastVoteCountRef = useRef<string>('')
  const failCountRef = useRef<number>(0)

  // 用 ref 存 callbacks，避免 effect 每次都重建
  const onRoundChangeRef = useRef(onRoundChange)
  const onVoteProgressRef = useRef(onVoteProgress)
  const onVotersUpdateRef = useRef(onVotersUpdate)
  onRoundChangeRef.current = onRoundChange
  onVoteProgressRef.current = onVoteProgress
  onVotersUpdateRef.current = onVotersUpdate

  const poll = useCallback(async () => {
    if (!eventCode) return

    try {
      const res = await fetch(`/api/events/${eventCode}/live`, {
        // 不快取，確保拿最新狀態
        cache: 'no-store',
      })

      if (!res.ok) {
        failCountRef.current++
        return
      }

      const data: LiveState = await res.json()
      failCountRef.current = 0 // 成功則重置失敗計數

      // Change detection：用 round_id + status + event_status + display_mode + countdown_end 判斷狀態是否切換
      const stateKey = `${data.current_round_id}|${data.current_round_status}|${data.event_status}|${data.display_mode ?? 'auto'}|${data.countdown_end ?? ''}`
      if (stateKey !== lastStateRef.current) {
        lastStateRef.current = stateKey
        onRoundChangeRef.current(data)
      }

      // 投票進度：vote_count 或 participant_count 任一變化就觸發
      const progressKey = `${data.vote_count}|${data.participant_count}`
      if (progressKey !== lastVoteCountRef.current) {
        lastVoteCountRef.current = progressKey
        onVoteProgressRef.current(data.vote_count, data.participant_count, data.votes_per_person ?? 1)
      }

      // 最近投票者：每次 poll 都通知（讓 VoteBalls 自行去重）
      if (data.recent_voters && data.recent_voters.length > 0) {
        onVotersUpdateRef.current?.(data.recent_voters)
      }
    } catch {
      failCountRef.current++
      // 靜默忽略網路錯誤，下一輪再試
    }
  }, [eventCode])

  // 立即觸發一次（不等第一個 interval）
  const pollRef = useRef(poll)
  pollRef.current = poll

  useEffect(() => {
    if (!enabled || !eventCode) return

    // 立即 poll 一次，取得初始狀態
    pollRef.current()

    // 啟動定時 polling
    intervalRef.current = setInterval(() => {
      // 連續失敗時用指數退避（最多 5 秒）
      const backoffMultiplier = Math.min(failCountRef.current, 4)
      if (backoffMultiplier > 0) {
        // 每次失敗後，有機率跳過這個 tick（簡單的退避）
        const skipProbability = backoffMultiplier * 0.2 // 20% ~ 80%
        if (Math.random() < skipProbability) return
      }
      pollRef.current()
    }, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, eventCode, intervalMs])

  /**
   * 手動立即觸發一次 poll（供按鈕手動同步使用）
   */
  const syncNow = useCallback(() => {
    // 重置狀態快取，強制觸發 callback（即使資料沒變）
    lastStateRef.current = ''
    lastVoteCountRef.current = ''
    pollRef.current()
  }, [])

  return { syncNow }
}
