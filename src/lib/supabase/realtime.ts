import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from './client'

const supabase = createClient()

/** 訂閱活動排行榜更新（大螢幕用） */
export function subscribeToScores(
  eventCode: string,
  onUpdate: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  return supabase
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
  return supabase
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
  return supabase
    .channel(`control:${eventCode}`)
    .on('broadcast', { event: 'command' }, ({ payload }) => {
      onCommand(payload)
    })
    .subscribe()
}

/** 廣播分數更新 */
export async function broadcastScoreUpdate(
  eventCode: string,
  data: Record<string, unknown>
) {
  await supabase.channel(`event:${eventCode}`).send({
    type: 'broadcast',
    event: 'score_update',
    payload: data,
  })
}

/** 廣播回合狀態 */
export async function broadcastRoundStatus(
  eventCode: string,
  data: Record<string, unknown>
) {
  await supabase.channel(`round:${eventCode}`).send({
    type: 'broadcast',
    event: 'status_change',
    payload: data,
  })
}

/** 廣播主持人指令 */
export async function broadcastCommand(
  eventCode: string,
  data: Record<string, unknown>
) {
  await supabase.channel(`control:${eventCode}`).send({
    type: 'broadcast',
    event: 'command',
    payload: data,
  })
}
