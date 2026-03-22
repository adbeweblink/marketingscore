'use client'

import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

/**
 * 訂閱 Supabase Realtime channel
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
 * 訂閱多個事件的 channel
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
