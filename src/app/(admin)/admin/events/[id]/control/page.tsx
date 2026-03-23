'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Play, Square, SkipForward, Eye, Trophy,
  Plus, Minus, Timer, Users, Monitor, Loader2, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Round, RoundStatus, Table } from '@/types/database'

// 回合狀態顯示設定
const STATUS_COLORS: Record<RoundStatus, string> = {
  pending: 'bg-white/10 text-white/40',
  open: 'bg-green-500/20 text-green-300',
  closed: 'bg-yellow-500/20 text-yellow-300',
  revealed: 'bg-gold-400/20 text-gold-200',
}

const STATUS_LABELS: Record<RoundStatus, string> = {
  pending: '待開始',
  open: '投票中',
  closed: '已結束',
  revealed: '已揭曉',
}

/**
 * 內部元件：使用 useSearchParams，需包在 Suspense 內
 */
function HostControlInner({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const searchParams = useSearchParams()

  // 從 URL searchParam ?key=xxx 取得 admin key（MVP 簡單方案）
  const adminKey = searchParams.get('key') ?? ''

  // 頁面狀態
  const [rounds, setRounds] = useState<Round[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [activeRound, setActiveRound] = useState<string | null>(null)
  const [voteProgress, setVoteProgress] = useState({ voted: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // 手動加減分狀態：桌次 ID → 目前分數
  const [manualScores, setManualScores] = useState<Record<string, number>>({})

  // Polling interval ref（每 3 秒查詢一次投票進度）
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentRound = rounds.find((r) => r.id === activeRound)

  // ─── 載入活動資料 ───────────────────────────────────────────────
  const loadEventData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${id}?key=${encodeURIComponent(adminKey)}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '載入失敗')
        return
      }
      const data = await res.json()
      setRounds(data.rounds ?? [])
      setTables(data.tables ?? [])
      setVoteProgress((prev) => ({ ...prev, total: data.participant_count ?? 0 }))

      // 找出目前正在進行的回合
      const openRound = data.rounds?.find((r: Round) => r.status === 'open')
      if (openRound && !activeRound) {
        setActiveRound(openRound.id)
      }
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setLoading(false)
    }
  }, [id, adminKey, activeRound])

  // ─── 查詢投票進度 ────────────────────────────────────────────────
  const pollVoteProgress = useCallback(async () => {
    if (!activeRound) return
    try {
      const res = await fetch(`/api/results?round_id=${activeRound}`)
      if (!res.ok) return
      const data = await res.json()
      // results API 回傳 vote_count 總數
      if (data.results) {
        const voted = data.results.reduce(
          (sum: number, r: { vote_count?: number }) => sum + (r.vote_count ?? 0),
          0
        )
        setVoteProgress((prev) => ({ ...prev, voted }))
      }
    } catch {
      // 查詢失敗靜默忽略，不干擾主流程
    }
  }, [activeRound])

  // 頁面載入時取得資料
  useEffect(() => {
    if (adminKey) {
      loadEventData()
    } else {
      setError('缺少 admin key，請在 URL 加上 ?key=YOUR_KEY')
      setLoading(false)
    }
  }, [adminKey, loadEventData])

  // 當 activeRound 為 open 狀態時，啟動 polling
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    if (activeRound && currentRound?.status === 'open') {
      pollRef.current = setInterval(pollVoteProgress, 3000)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [activeRound, currentRound?.status, pollVoteProgress])

  // ─── 呼叫 Admin Round API ────────────────────────────────────────
  async function callRoundAPI(
    action: string,
    roundId?: string,
    extraData?: Record<string, unknown>
  ) {
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
          round_id: roundId ?? activeRound,
          event_id: id,
          data: extraData,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '操作失敗')
        return false
      }
      return true
    } catch {
      setError('網路錯誤，請重試')
      return false
    } finally {
      setActionLoading(false)
    }
  }

  // ─── 主持人動作處理 ──────────────────────────────────────────────
  async function handleAction(action: string, roundId?: string) {
    const targetRoundId = roundId ?? activeRound

    switch (action) {
      case 'start': {
        if (!roundId) return
        // 先樂觀更新 UI，再打 API
        setActiveRound(roundId)
        setRounds((prev) =>
          prev.map((r) => (r.id === roundId ? { ...r, status: 'open' as RoundStatus } : r))
        )
        setVoteProgress((prev) => ({ ...prev, voted: 0 }))

        const ok = await callRoundAPI('start', roundId)
        if (!ok) {
          // 還原樂觀更新
          setRounds((prev) =>
            prev.map((r) => (r.id === roundId ? { ...r, status: 'pending' as RoundStatus } : r))
          )
          setActiveRound(null)
        }
        break
      }

      case 'stop': {
        setRounds((prev) =>
          prev.map((r) => (r.id === targetRoundId ? { ...r, status: 'closed' as RoundStatus } : r))
        )
        const ok = await callRoundAPI('stop')
        if (!ok) {
          setRounds((prev) =>
            prev.map((r) => (r.id === targetRoundId ? { ...r, status: 'open' as RoundStatus } : r))
          )
        }
        break
      }

      case 'reveal': {
        setRounds((prev) =>
          prev.map((r) => (r.id === targetRoundId ? { ...r, status: 'revealed' as RoundStatus } : r))
        )
        const ok = await callRoundAPI('reveal')
        if (!ok) {
          setRounds((prev) =>
            prev.map((r) => (r.id === targetRoundId ? { ...r, status: 'closed' as RoundStatus } : r))
          )
        }
        break
      }

      case 'next': {
        const currentIndex = rounds.findIndex((r) => r.id === activeRound)
        if (currentIndex < rounds.length - 1) {
          const nextRound = rounds[currentIndex + 1]
          setActiveRound(nextRound.id)
          setRounds((prev) =>
            prev.map((r) => (r.id === nextRound.id ? { ...r, status: 'open' as RoundStatus } : r))
          )
          setVoteProgress((prev) => ({ ...prev, voted: 0 }))

          const ok = await callRoundAPI('start', nextRound.id)
          if (!ok) {
            setRounds((prev) =>
              prev.map((r) => (r.id === nextRound.id ? { ...r, status: 'pending' as RoundStatus } : r))
            )
            setActiveRound(activeRound)
          }
        }
        break
      }

      case 'countdown': {
        await callRoundAPI('countdown', undefined, { seconds: 30 })
        break
      }

      case 'show_final': {
        await callRoundAPI('countdown', undefined, { seconds: 0 })
        break
      }
    }
  }

  // ─── 手動加減分（cheer 回合） ────────────────────────────────────
  async function handleManualScore(tableId: string, delta: number) {
    // 樂觀更新本地分數
    setManualScores((prev) => ({
      ...prev,
      [tableId]: (prev[tableId] ?? 0) + delta,
    }))

    await callRoundAPI('manual_score', undefined, {
      table_id: tableId,
      score_delta: delta,
    })
  }

  // ─── 載入中 / 錯誤畫面 ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-3" />
          <p className="text-white/40 text-sm">載入活動資料...</p>
        </div>
      </div>
    )
  }

  if (error && rounds.length === 0) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-300 font-bold mb-2">無法載入</p>
          <p className="text-white/40 text-sm mb-6">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadEventData() }}
            className="px-6 py-3 rounded-xl font-bold bg-gold-400/20 text-gold-200"
          >
            重試
          </button>
        </div>
      </div>
    )
  }

  // ─── 主頁面 ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-dark p-4 pb-32">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gold-200">主持人控制台</h1>
          <p className="text-xs text-white/30">活動 ID: {id}</p>
          {adminKey && (
            <p className="text-xs text-green-400/60 mt-0.5">已驗證管理員</p>
          )}
        </div>

        {/* 操作中 loading 提示 */}
        {actionLoading && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-400/10 border border-gold-400/20">
            <Loader2 className="w-4 h-4 text-gold-400 animate-spin" />
            <span className="text-gold-200/60 text-sm">處理中...</span>
          </div>
        )}

        {/* 錯誤提示（非致命錯誤） */}
        {error && rounds.length > 0 && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-red-300/80 text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-300/40 text-xs underline"
            >
              關閉
            </button>
          </div>
        )}

        {/* 目前回合狀態 */}
        {currentRound && (
          <motion.div
            layout
            className="mb-6 p-4 rounded-xl bg-surface-card border-2 border-gold-400/30"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gold-200/60">目前回合</span>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', STATUS_COLORS[currentRound.status])}>
                {STATUS_LABELS[currentRound.status]}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-gold-200 mb-3">
              {currentRound.title}
            </h2>

            {/* 投票進度 */}
            {currentRound.status === 'open' && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-white/40 mb-1">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> 投票進度
                  </span>
                  <span>{voteProgress.voted} / {voteProgress.total}</span>
                </div>
                <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold-400 rounded-full transition-all duration-500"
                    style={{
                      width: voteProgress.total > 0
                        ? `${(voteProgress.voted / voteProgress.total) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
            )}

            {/* 控制按鈕 */}
            <div className="grid grid-cols-2 gap-2">
              {currentRound.status === 'open' && (
                <>
                  <button
                    onClick={() => handleAction('stop')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                      bg-red-500/20 text-red-300 active:bg-red-500/30
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Square size={16} /> 結束投票
                  </button>
                  <button
                    onClick={() => handleAction('countdown')}
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                      bg-white/5 text-white/60 active:bg-white/10
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Timer size={16} /> 倒數 30s
                  </button>
                </>
              )}

              {currentRound.status === 'closed' && (
                <button
                  onClick={() => handleAction('reveal')}
                  disabled={actionLoading}
                  className="col-span-2 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-lg
                    bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
                    shadow-[0_0_15px_rgba(255,179,0,0.3)]
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye size={20} /> 揭曉結果
                </button>
              )}

              {currentRound.status === 'revealed' && (
                <button
                  onClick={() => handleAction('next')}
                  disabled={actionLoading}
                  className="col-span-2 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-lg
                    bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
                    shadow-[0_0_15px_rgba(255,179,0,0.3)]
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SkipForward size={20} /> 下一輪
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* 手動加減分（cheer 回合） */}
        {currentRound?.type_id === 'cheer' && tables.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-surface-card border border-white/5">
            <h3 className="text-sm font-bold text-gold-200/60 mb-3">手動加減分</h3>
            <div className="space-y-2">
              {tables.map((table) => (
                <div key={table.id} className="flex items-center justify-between py-2">
                  <span className="text-white/60">第 {table.number} 桌</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleManualScore(table.id, -1)}
                      disabled={actionLoading}
                      className="w-8 h-8 rounded-lg bg-red-500/20 text-red-300 flex items-center justify-center
                        disabled:opacity-50"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-12 text-center font-bold text-gold-200 tabular-nums">
                      {manualScores[table.id] ?? 0}
                    </span>
                    <button
                      onClick={() => handleManualScore(table.id, 1)}
                      disabled={actionLoading}
                      className="w-8 h-8 rounded-lg bg-green-500/20 text-green-300 flex items-center justify-center
                        disabled:opacity-50"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 回合列表 */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-white/30 mb-2">
            所有回合（{rounds.length} 個）
          </h3>
          {rounds.map((round) => (
            <motion.div
              key={round.id}
              layout
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                round.id === activeRound
                  ? 'bg-gold-400/10 border-gold-400/30'
                  : 'bg-surface-card border-white/5'
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center text-sm font-bold text-white/40">
                {round.seq}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white/80 truncate text-sm">
                  {round.title}
                </div>
                <div className="text-xs text-white/30 mt-0.5">
                  {round.type_id}
                </div>
              </div>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', STATUS_COLORS[round.status])}>
                {STATUS_LABELS[round.status]}
              </span>
              {round.status === 'pending' && (
                <button
                  onClick={() => handleAction('start', round.id)}
                  disabled={actionLoading}
                  className="w-8 h-8 rounded-lg bg-green-500/20 text-green-300 flex items-center justify-center
                    disabled:opacity-50"
                >
                  <Play size={14} />
                </button>
              )}
            </motion.div>
          ))}

          {rounds.length === 0 && !loading && (
            <div className="text-center py-8 text-white/30 text-sm">
              此活動尚未設定回合
            </div>
          )}
        </div>

        {/* 底部快捷工具列 */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-dark/90 backdrop-blur-lg border-t border-white/5">
          <div className="max-w-lg mx-auto flex gap-3">
            <a
              href={`/display/${id}`}
              target="_blank"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm
                bg-white/5 text-white/60 active:bg-white/10"
            >
              <Monitor size={16} /> 開啟大螢幕
            </a>
            <button
              onClick={() => handleAction('show_final')}
              disabled={actionLoading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm
                bg-gold-400/10 text-gold-200 active:bg-gold-400/20
                disabled:opacity-50"
            >
              <Trophy size={16} /> 最終排名
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 頁面入口：包 Suspense boundary，讓 useSearchParams 在 SSR 時正確處理
 */
export default function HostControlPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-dark flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
        </div>
      }
    >
      <HostControlInner params={params} />
    </Suspense>
  )
}
