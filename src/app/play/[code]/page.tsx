'use client'

import { useState, useCallback, useRef } from 'react'
import { use } from 'react'
import { TableSelector } from '@/components/play/TableSelector'
import { ScoreSlider } from '@/components/play/ScoreSlider'
import { QuizOptions } from '@/components/play/QuizOptions'
import { useRealtimeMulti, useRealtimeDB, type RealtimeDBPayload } from '@/hooks/useRealtime'
import { CHANNELS } from '@/lib/channels'
import type { Table, Round, RoundStatus } from '@/types/database'

type PlayPhase = 'join' | 'waiting' | 'voting' | 'submitted' | 'result'

interface ParticipantInfo {
  id: string
  display_name: string
  table_id: string
  table_number: number
}

interface EventInfo {
  id: string
  name: string
  code: string
}

export default function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = use(params)
  const [phase, setPhase] = useState<PlayPhase>('join')
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null)
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 儲存 JWT token
  const tokenRef = useRef<string | null>(null)

  // 加入活動
  async function handleJoin(tableId: string, displayName: string) {
    setLoading(true)
    setError(null)

    try {
      const table = tables.length > 0
        ? tables.find((t) => t.id === tableId)
        : null
      const tableNumber = table?.number ?? parseInt(tableId)

      const res = await fetch('/api/auth/liff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_code: code,
          table_number: tableNumber,
          display_name: displayName,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '加入失敗')
        return
      }

      // 儲存 JWT token
      tokenRef.current = data.token
      setParticipant(data.participant)
      setEventInfo(data.event)
      setTables(data.tables)

      if (data.current_round?.status === 'open') {
        setCurrentRound(data.current_round)
        setPhase('voting')
      } else {
        setPhase('waiting')
      }
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setLoading(false)
    }
  }

  // 投票
  async function handleVote(targetTableId?: string, score?: number, answer?: string) {
    if (!participant || !currentRound || !tokenRef.current) return

    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          round_id: currentRound.id,
          target_table_id: targetTableId ?? undefined,
          score,
          answer,
        }),
      })

      if (res.ok) {
        setPhase('submitted')
      } else {
        const data = await res.json()
        setError(data.error ?? '投票失敗')
      }
    } catch {
      setError('投票失敗，請重試')
    }
  }

  // ─── Broadcast 事件處理（維持相容性）──────────────────────────

  // 回合狀態變更（broadcast 來源）
  const handleStatusChange = useCallback((payload: Record<string, unknown>) => {
    try {
      const data = payload as { status?: RoundStatus; round?: Round }
      if (data.status === 'open' && data.round) {
        setCurrentRound(data.round)
        setPhase('voting')
      } else if (data.status === 'closed' || data.status === 'revealed') {
        setPhase('result')
      }
    } catch {
      // payload 解析錯誤不 crash
    }
  }, [])

  // 主持人指令（broadcast 來源）
  const handleCommand = useCallback((payload: Record<string, unknown>) => {
    try {
      const data = payload as { action?: string; round?: Round }
      if (data.action === 'show_round_intro' && data.round) {
        setCurrentRound(data.round)
        setPhase('waiting')
      }
    } catch {
      // payload 解析錯誤不 crash
    }
  }, [])

  // 訂閱 broadcast channel（相容舊版）
  useRealtimeMulti(CHANNELS.roundStatus(code), {
    status_change: handleStatusChange,
    command: handleCommand,
  })

  // ─── DB 層直接訂閱：rounds 表狀態變更 ───────────────────────────
  // 當 rounds 狀態改變時，手機端自動切換投票/等待畫面
  useRealtimeDB<{ id: string; status: RoundStatus; event_id: string }>(
    'rounds',
    // 已加入活動後才訂閱（依 event_id 過濾）
    eventInfo?.id ? `event_id=eq.${eventInfo.id}` : undefined,
    undefined, // INSERT 不處理
    useCallback((payload: RealtimeDBPayload<{ id: string; status: RoundStatus; event_id: string }>) => {
      // UPDATE 觸發（回合狀態改變）
      const newStatus = payload.new?.status
      if (!newStatus) return

      if (newStatus === 'open') {
        // 回合開始，拉取最新回合資料
        if (eventInfo?.id) {
          fetch(`/api/results?event_code=${code}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.current_round) {
                setCurrentRound(data.current_round)
                setPhase('voting')
              }
            })
            .catch(() => { /* 靜默忽略 */ })
        }
      } else if (newStatus === 'closed' || newStatus === 'revealed') {
        // 回合結束或揭曉，顯示結果畫面
        setPhase('result')
      }
    }, [code, eventInfo?.id])
  )

  return (
    <div className="min-h-screen bg-surface-dark">
      {phase === 'join' && (
        <TableSelector
          tables={tables.length > 0 ? tables : Array.from({ length: 8 }, (_, i) => ({
            id: String(i + 1),
            event_id: '',
            number: i + 1,
            name: null,
            created_at: '',
          }))}
          eventName={eventInfo?.name ?? `活動 ${code}`}
          onJoin={handleJoin}
          loading={loading}
        />
      )}

      {phase === 'waiting' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <div className="text-4xl mb-4">&#9203;</div>
          <h2 className="text-xl font-bold text-gold-200 mb-2">
            {currentRound ? `即將開始：${currentRound.title}` : '等待主持人開始'}
          </h2>
          <p className="text-white/40 text-sm">
            {participant?.display_name}（第 {participant?.table_number} 桌）
          </p>
        </div>
      )}

      {phase === 'voting' && currentRound && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-gold-200/60">
              {currentRound.title}
            </h2>
          </div>

          {/* 評分制 */}
          {currentRound.type_id === 'scoring' && (
            <div className="w-full max-w-sm mx-auto space-y-4">
              {tables.filter(t => t.number !== participant?.table_number).map(t => (
                <div key={t.id} className="p-4 rounded-xl bg-surface-card border border-white/5">
                  <div className="text-sm text-gold-200/60 mb-2">第 {t.number} 桌</div>
                  <ScoreSlider
                    min={currentRound.config?.scale_min ?? 1}
                    max={currentRound.config?.scale_max ?? 10}
                    onSubmit={(score) => handleVote(t.id, score)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 猜謎制 */}
          {currentRound.type_id === 'quiz' && (
            <QuizOptions
              question={currentRound.config?.question ?? '猜猜這是哪一桌？'}
              options={tables.map(t => ({
                id: t.id,
                label: t.name ?? `第 ${t.number} 桌`,
                disabled: t.number === participant?.table_number,
              }))}
              onSubmit={(selectedId) => handleVote(selectedId, undefined, selectedId)}
            />
          )}

          {/* 歡呼制 */}
          {currentRound.type_id === 'cheer' && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">&#128079;</div>
              <p className="text-gold-200/60">
                本輪由主持人裁決，請現場歡呼加油！
              </p>
            </div>
          )}
        </div>
      )}

      {phase === 'submitted' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <div className="text-4xl mb-4">&#9989;</div>
          <h2 className="text-xl font-bold text-gold-200 mb-2">投票成功！</h2>
          <p className="text-white/40 text-sm">等待結果揭曉...</p>
        </div>
      )}

      {phase === 'result' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <div className="text-4xl mb-4">&#127942;</div>
          <h2 className="text-xl font-bold text-gold-200 mb-2">結果已揭曉！</h2>
          <p className="text-white/40 text-sm">請看大螢幕</p>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-4 right-4 p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-center text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">關閉</button>
        </div>
      )}
    </div>
  )
}
