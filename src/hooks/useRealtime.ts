'use client'

import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { RoundStatus } from '@/types/database'

/**
 * 訂閱 Supabase Realtime broadcast channel
 * 自動處理訂閱/取消訂閱生命週期
 */
export function useRealtime(
  channelName: string,
  eventName: string,
  onMessage: (payload: Record<string, unknown>) => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const callbackRef = useRef(onMessage)
  callbackRef.current = onMessage

  useEffect(() => {
    if (!channelName) return

    const supabase = createClient()

    channelRef.current = supabase
      .channel(channelName)
      .on('broadcast', { event: eventName }, ({ payload }) => {
        callbackRef.current(payload)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] 已連線: ${channelName}`)
        }
      })

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [channelName, eventName])

  return channelRef
}

/**
 * 訂閱多個 broadcast 事件的 channel
 */
export function useRealtimeMulti(
  channelName: string,
  handlers: Record<string, (payload: Record<string, unknown>) => void>
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!channelName) return

    const supabase = createClient()
    let channel = supabase.channel(channelName)

    for (const eventName of Object.keys(handlersRef.current)) {
      channel = channel.on('broadcast', { event: eventName }, ({ payload }) => {
        handlersRef.current[eventName]?.(payload)
      })
    }

    channelRef.current = channel.subscribe()

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [channelName])

  return channelRef
}

/**
 * DB 變更回調的 payload 型別
 */
export interface RealtimeDBPayload<T = Record<string, unknown>> {
  /** 事件類型：INSERT / UPDATE / DELETE */
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  /** 變更後的新資料 */
  new: T
  /** 變更前的舊資料（UPDATE/DELETE 才有） */
  old: Partial<T>
}

/**
 * 訂閱 Supabase Realtime postgres_changes（DB 層直接推送）
 *
 * 用途：
 * - 訂閱 results_cache 表 INSERT/UPDATE → 大螢幕自動更新即時分數
 * - 訂閱 rounds 表 UPDATE → 所有端在回合狀態改變時自動切換畫面
 *
 * 前置條件：
 * - 已執行 ALTER PUBLICATION supabase_realtime ADD TABLE results_cache, rounds;
 * - RLS policy 需有 SELECT 權限（anon key 可讀）
 *
 * @param table 要訂閱的資料表名稱
 * @param filter 可選的 row-level filter，例如 `event_id=eq.${eventId}`
 * @param onInsert INSERT 事件回調
 * @param onUpdate UPDATE 事件回調
 */
export function useRealtimeDB<T = Record<string, unknown>>(
  table: string,
  filter: string | undefined,
  onInsert?: (payload: RealtimeDBPayload<T>) => void,
  onUpdate?: (payload: RealtimeDBPayload<T>) => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  // 用 ref 儲存回調，避免每次 render 都重建 subscription
  const onInsertRef = useRef(onInsert)
  const onUpdateRef = useRef(onUpdate)
  onInsertRef.current = onInsert
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!table) return

    const supabase = createClient()
    // 每個 channel 名稱需唯一，用 table + filter 組合
    const channelName = `db:${table}:${filter ?? 'all'}`

    // 設定 postgres_changes 訂閱選項
    const subscribeOptions = filter
      ? { event: '*' as const, schema: 'public', table, filter }
      : { event: '*' as const, schema: 'public', table }

    channelRef.current = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        subscribeOptions,
        (payload) => {
          const typed = payload as unknown as RealtimeDBPayload<T>
          if (payload.eventType === 'INSERT') {
            onInsertRef.current?.(typed)
          } else if (payload.eventType === 'UPDATE') {
            onUpdateRef.current?.(typed)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[RealtimeDB] 已訂閱: ${channelName}`)
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[RealtimeDB] 訂閱失敗: ${channelName}`)
        }
      })

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [table, filter])

  return channelRef
}

/**
 * 專用 hook：同時訂閱 results_cache 和 rounds 表的 DB 變更
 *
 * @param eventId 活動 ID（用於過濾）
 * @param onResultsChange results_cache 有變更時觸發
 * @param onRoundStatusChange rounds 狀態改變時觸發
 */
export function useEventRealtimeDB(
  eventId: string | undefined,
  onResultsChange?: (payload: RealtimeDBPayload) => void,
  onRoundStatusChange?: (newStatus: RoundStatus, roundId: string) => void
) {
  // 訂閱 results_cache（按 event 的所有 round 過濾需要 join，暫用全表訂閱後前端過濾）
  useRealtimeDB(
    'results_cache',
    undefined, // results_cache 無直接 event_id，用前端過濾
    (payload) => {
      // INSERT 觸發（新 round 開始時會 upsert）
      onResultsChange?.(payload)
    },
    (payload) => {
      // UPDATE 觸發（投票分數更新時）
      onResultsChange?.(payload)
    }
  )

  // 訂閱 rounds 表狀態變更
  useRealtimeDB<{ id: string; status: RoundStatus; event_id: string }>(
    'rounds',
    eventId ? `event_id=eq.${eventId}` : undefined,
    undefined, // INSERT 不處理
    (payload) => {
      // UPDATE 觸發（狀態從 pending → open → closed → revealed）
      const newStatus = payload.new?.status
      const roundId = payload.new?.id
      if (newStatus && roundId) {
        onRoundStatusChange?.(newStatus, roundId)
      }
    }
  )
}
