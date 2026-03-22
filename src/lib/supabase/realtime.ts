'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from './client'

/**
 * #12 fix: 移除模組頂層 singleton，改為 lazy init
 * 此檔案只供客戶端使用（'use client'）
 */
let _client: ReturnType<typeof createClient> | null = null
function getClient() {
  if (!_client) _client = createClient()
  return _client
}

/** 訂閱活動排行榜更新（大螢幕用） */
export function subscribeToScores(
  eventCode: string,
  onUpdate: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  return getClient()
    .channel(`event:${eventCode}`)
    .on('broadcast', { event: 'score_update' }, ({ payload }) => {
      onUpdate(payload)
    })
    .subscribe()
}

/** 訂閱回合狀態變更（所有端用） */
export function subscribeToRoundStatus(
  eventCode: string,
  onStatusChange: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  return getClient()
    .channel(`round:${eventCode}`)
    .on('broadcast', { event: 'status_change' }, ({ payload }) => {
      onStatusChange(payload)
    })
    .subscribe()
}

/** 訂閱主持人指令（所有端用） */
export function subscribeToControl(
  eventCode: string,
  onCommand: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  return getClient()
    .channel(`control:${eventCode}`)
    .on('broadcast', { event: 'command' }, ({ payload }) => {
      onCommand(payload)
    })
    .subscribe()
}
