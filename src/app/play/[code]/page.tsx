'use client'

import { useState, useCallback } from 'react'
import { use } from 'react'
import { TableSelector } from '@/components/play/TableSelector'
import { ScoreSlider } from '@/components/play/ScoreSlider'
import { QuizOptions } from '@/components/play/QuizOptions'
import { useRealtimeMulti } from '@/hooks/useRealtime'
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

  // 初始載入桌次（掃 QR Code 後）
  async function loadTables() {
    try {
      const res = await fetch(`/api/auth/liff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_code: code, table_number: 0, display_name: '__probe__' }),
      })
      // 這會失敗但我們可以從活動資訊取得桌次
      // 更好的做法：建一個 GET /api/events/:code 端點
    } catch {
      // ignore
    }
  }

  // 提交投票
  async function handleVote(score?: number, answer?: string) {
    if (!participant || !currentRound) return

    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-participant-id': participant.id,
        },
        body: JSON.stringify({
          round_id: currentRound.id,
          // 評分制：投給所有其他桌（簡化：先假設投給特定桌）
          score,
          answer,
        }),
      })

      if (res.ok) {
        setPhase('submitted')
      }
    } catch {
      setError('投票失敗，請重試')
    }
  }

  // Realtime 事件
  const handleStatusChange = useCallback((payload: Record<string, unknown>) => {
    const data = payload as { status?: RoundStatus; round?: Round }
    if (data.status === 'open' && data.round) {
      setCurrentRound(data.round)
      setPhase('voting')
    } else if (data.status === 'closed') {
      setPhase('result')
    } else if (data.status === 'revealed') {
      setPhase('result')
    }
  }, [])

  const handleCommand = useCallback((payload: Record<string, unknown>) => {
    const data = payload as { action?: string; round?: Round }
    if (data.action === 'show_round_intro' && data.round) {
      setCurrentRound(data.round)
      setPhase('waiting')
    }
  }, [])

  useRealtimeMulti(`play:${code}`, {
    status_change: handleStatusChange,
    command: handleCommand,
  })

  return (
    <div className="min-h-screen bg-surface-dark">
      {/* 加入階段 */}
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

      {/* 等待階段 */}
      {phase === 'waiting' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-gold-200 mb-2">
            {currentRound ? `即將開始：${currentRound.title}` : '等待主持人開始'}
          </h2>
          <p className="text-white/40 text-sm">
            {participant?.display_name}（第 {participant?.table_number} 桌）
          </p>
        </div>
      )}

      {/* 投票階段 */}
      {phase === 'voting' && currentRound && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-gold-200/60">
              {currentRound.title}
            </h2>
          </div>

          {currentRound.type_id === 'scoring' && (
            <ScoreSlider
              min={currentRound.config?.scale_min ?? 1}
              max={currentRound.config?.scale_max ?? 10}
              onSubmit={(score) => handleVote(score)}
            />
          )}

          {currentRound.type_id === 'quiz' && (
            <QuizOptions
              question={currentRound.config?.question ?? '猜猜這是哪一桌？'}
              options={Array.from({ length: 8 }, (_, i) => ({
                id: String(i + 1),
                label: `第 ${i + 1} 桌`,
                disabled: i + 1 === participant?.table_number,
              }))}
              onSubmit={(selectedId) => handleVote(undefined, selectedId)}
            />
          )}

          {currentRound.type_id === 'cheer' && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">👏</div>
              <p className="text-gold-200/60">
                本輪由主持人裁決，請現場歡呼加油！
              </p>
            </div>
          )}
        </div>
      )}

      {/* 已投票 */}
      {phase === 'submitted' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gold-200 mb-2">投票成功！</h2>
          <p className="text-white/40 text-sm">等待結果揭曉...</p>
        </div>
      )}

      {/* 結果階段 */}
      {phase === 'result' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <div className="text-4xl mb-4">🏆</div>
          <h2 className="text-xl font-bold text-gold-200 mb-2">結果已揭曉！</h2>
          <p className="text-white/40 text-sm">請看大螢幕</p>
        </div>
      )}

      {/* 錯誤提示 */}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-center text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">關閉</button>
        </div>
      )}
    </div>
  )
}
