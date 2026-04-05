'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Play, Square, SkipForward, Eye, Trophy,
  Plus, Minus, Timer, Users, Monitor, Loader2, AlertCircle,
  Share2, Copy, X, Check, RotateCcw, ArrowLeft, QrCode, LayoutList, RefreshCw
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { cn } from '@/lib/utils'
import { useLiveSync } from '@/hooks/useLiveSync'
import { useHostActions } from '@/hooks/useHostActions'
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

  // Admin key：先看 URL ?key=，再看 localStorage，都沒有就顯示輸入框
  const urlKey = searchParams.get('key') ?? ''
  const [adminKey, setAdminKey] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState(false)

  // 初始化 admin key（優先 URL > localStorage）
  useEffect(() => {
    if (urlKey) {
      setAdminKey(urlKey)
      localStorage.setItem('ms_admin_key', urlKey)
    } else {
      const stored = localStorage.getItem('ms_admin_key')
      if (stored) setAdminKey(stored)
    }
  }, [urlKey])

  // 活動狀態追蹤
  const [eventStatus, setEventStatus] = useState<string>('active')

  // 頁面狀態
  const [rounds, setRounds] = useState<Round[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [activeRound, setActiveRound] = useState<string | null>(null)
  const [voteProgress, setVoteProgress] = useState({ voted: 0, total: 0, votesPerPerson: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // actionLoading 由 useHostActions 提供（見下方），此處不另行宣告

  // 新增回合表單
  const [showAddRound, setShowAddRound] = useState(false)
  const [newRoundTitle, setNewRoundTitle] = useState('')
  const [newRoundType, setNewRoundType] = useState('scoring')

  // 手動加減分狀態：桌次 ID → 目前分數
  const [manualScores, setManualScores] = useState<Record<string, number>>({})

  // 大螢幕顯示模式（'auto' = 跟隨回合狀態）
  const [displayMode, setDisplayMode] = useState<string>('auto')

  // #2 分享連結 modal
  const [showShareModal, setShowShareModal] = useState(false)
  const [copiedJoin, setCopiedJoin] = useState(false)

  // #5 複製控制台連結
  const [copiedControl, setCopiedControl] = useState(false)

  // #6 長按結束投票狀態
  const [stopPressProgress, setStopPressProgress] = useState(0) // 0~100
  const stopPressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPressStartRef = useRef<number>(0)

  // Polling interval ref（已由 useLiveSync 統一管理，保留供手動刷新用）
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentRound = rounds.find((r) => r.id === activeRound)

  // 活動代碼（從 API 載入後取得）
  const [eventCode, setEventCode] = useState<string>('')

  // 加入連結（用活動代碼而非 UUID）
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/play/${eventCode || id}`
    : `/play/${eventCode || id}`

  // 全員投完判斷
  // 全員投完 = 票數 >= 人數 × 每人需投票數
  const allVoted = voteProgress.total > 0 && voteProgress.voted >= voteProgress.total * (voteProgress.votesPerPerson ?? 1)

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
      if (data.event_code) setEventCode(data.event_code)
      if (data.event?.status) setEventStatus(data.event.status)
      const count = data.participant_count ?? 0
      setVoteProgress((prev) => ({ ...prev, total: count }))

      // 找出目前正在進行的回合（用 functional check 避免依賴 activeRound）
      const openRound = data.rounds?.find((r: Round) => r.status === 'open')
      setActiveRound((prev) => {
        if (openRound && !prev) return openRound.id
        return prev
      })
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setLoading(false)
    }
  }, [id, adminKey]) // 移除 activeRound（改用 functional setState 避免循環依賴）

  // 頁面載入時取得資料
  useEffect(() => {
    if (adminKey) {
      loadEventData()
    } else {
      setLoading(false)
    }
  }, [adminKey, loadEventData])

  // ─── useLiveSync：1 秒 polling 投票進度（有 eventCode 才啟動）──
  useLiveSync(
    eventCode,
    // 回合狀態變更時，重新載入完整活動資料（確保 rounds 清單同步）
    useCallback(() => {
      if (adminKey) loadEventData()
    }, [adminKey, loadEventData]),
    // 投票進度：直接更新
    useCallback((voted: number, total: number, votesPerPerson?: number) => {
      setVoteProgress({ voted, total, votesPerPerson: votesPerPerson ?? 1 })
    }, []),
    {
      // 有 eventCode 就啟動 polling（即使沒有 open 回合也要同步人數）
      enabled: !!eventCode,
      intervalMs: 1000,
    }
  )

  // ─── useHostActions：統一 action 邏輯（loadEventData 已宣告，可安全引用）
  const {
    actionLoading,
    startRound,
    stopRound,
    revealRound,
    nextRound,
    addRound: addRoundAction,
    deleteRound: deleteRoundAction,
    finalize,
    reactivate: reactivateAction,
    setDisplayMode: setDisplayModeAction,
    manualScore: manualScoreAction,
    countdown: countdownAction,
  } = useHostActions({
    eventId: id,
    adminKey,
    rounds,
    activeRoundId: activeRound,
    onRoundsUpdate: setRounds,
    onActiveRoundChange: setActiveRound,
    onVoteReset: () => setVoteProgress((prev) => ({ ...prev, voted: 0 })),
    onReload: loadEventData,
    onError: setError,
    onEventStatusChange: setEventStatus,
  })

  // ─── 主持人動作處理（委派給 useHostActions）─────────────────────

  async function handleAction(action: string, roundId?: string) {
    switch (action) {
      case 'start':
        if (roundId) await startRound(roundId)
        break
      case 'stop':
        await stopRound()
        break
      case 'reveal':
        await revealRound()
        break
      case 'next':
        await nextRound()
        break
      case 'countdown':
        await countdownAction()
        break
      case 'show_final':
        await finalize()
        break
      case 'reactivate':
        await reactivateAction()
        break
      case 'add_round':
        if (!newRoundTitle.trim()) return
        await addRoundAction(newRoundTitle.trim(), newRoundType)
        setNewRoundTitle('')
        setShowAddRound(false)
        break
      case 'delete_round':
        if (!roundId) return
        if (!confirm('確定刪除此回合？')) return
        await deleteRoundAction(roundId)
        break
    }
  }

  // ─── 手動加減分（cheer 回合）委派給 useHostActions ───────────────
  async function handleManualScore(tableId: string, delta: number) {
    // 樂觀更新本地分數
    setManualScores((prev) => ({
      ...prev,
      [tableId]: (prev[tableId] ?? 0) + delta,
    }))
    await manualScoreAction(tableId, delta)
  }

  // ─── #2 複製加入連結 ─────────────────────────────────────────────
  async function handleCopyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopiedJoin(true)
      setTimeout(() => setCopiedJoin(false), 2000)
    } catch {
      // 複製失敗靜默忽略
    }
  }

  // ─── #5 複製控制台連結 ───────────────────────────────────────────
  async function handleCopyControlLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopiedControl(true)
      setTimeout(() => setCopiedControl(false), 2000)
    } catch {
      // 複製失敗靜默忽略
    }
  }

  // ─── 大螢幕模式切換（委派給 useHostActions）──────────────────────
  async function handleSetDisplayMode(newMode: string) {
    setDisplayMode(newMode)
    await setDisplayModeAction(newMode)
  }

  // ─── #6 長按結束投票 ─────────────────────────────────────────────
  function handleStopPressStart() {
    if (actionLoading) return
    stopPressStartRef.current = Date.now()
    setStopPressProgress(0)
    stopPressRef.current = setInterval(() => {
      const elapsed = Date.now() - stopPressStartRef.current
      const progress = Math.min((elapsed / 2000) * 100, 100)
      setStopPressProgress(progress)
      if (progress >= 100) {
        clearInterval(stopPressRef.current!)
        stopPressRef.current = null
        setStopPressProgress(0)
        handleAction('stop')
      }
    }, 30)
  }

  function handleStopPressEnd() {
    if (stopPressRef.current) {
      clearInterval(stopPressRef.current)
      stopPressRef.current = null
    }
    setStopPressProgress(0)
  }

  // ─── 載入中 / 錯誤畫面 ──────────────────────────────────────────
  // 沒有 admin key 時，顯示輸入框
  if (!adminKey) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-gold-200 mb-2">主持人控制台</h1>
          <p className="text-white/40 text-sm mb-6">請輸入管理密碼</p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setKeyError(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && keyInput.trim()) {
                setAdminKey(keyInput.trim())
                localStorage.setItem('ms_admin_key', keyInput.trim())
              }
            }}
            placeholder="管理密碼"
            autoFocus
            className={cn(
              'w-full px-5 py-4 rounded-2xl bg-surface-card border-2 text-white text-xl text-center placeholder-white/20 focus:outline-none transition-colors',
              keyError ? 'border-red-500' : 'border-white/10 focus:border-gold-400'
            )}
          />
          {keyError && <p className="text-red-400 text-sm mt-2">密碼錯誤</p>}
          <button
            onClick={() => {
              if (keyInput.trim()) {
                setAdminKey(keyInput.trim())
                localStorage.setItem('ms_admin_key', keyInput.trim())
              }
            }}
            disabled={!keyInput.trim()}
            className="w-full mt-4 py-4 rounded-2xl text-lg font-bold bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark disabled:opacity-30"
          >
            進入
          </button>
        </div>
      </div>
    )
  }

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
            onClick={() => {
              setAdminKey('')
              localStorage.removeItem('ms_admin_key')
              setKeyInput('')
              setKeyError(true)
              setError(null)
            }}
            className="px-6 py-3 rounded-xl font-bold bg-gold-400/20 text-gold-200"
          >
            重新輸入密碼
          </button>
        </div>
      </div>
    )
  }

  // ─── 主頁面 ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-dark p-4 pb-40">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <a
            href="/admin"
            className="p-2 rounded-lg bg-white/5 active:bg-white/10"
          >
            <ArrowLeft size={18} className="text-white/50" />
          </a>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gold-200">主持人控制台</h1>
            <p className="text-xs text-white/30">活動代碼: {eventCode || id}</p>
          </div>
        </div>

        {/* #1 已加入人數 + #2 分享連結按鈕 */}
        <div className="flex items-center justify-between mb-5 px-4 py-3 rounded-xl bg-surface-card border border-white/5">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gold-400" />
            <span className="text-white/60 text-sm">已加入</span>
            <span className="text-gold-200 font-bold text-lg tabular-nums">{voteProgress.total}</span>
            <span className="text-white/30 text-sm">人</span>
          </div>
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-400/10 text-gold-200 text-sm font-medium active:bg-gold-400/20"
          >
            <Share2 size={14} /> 分享加入連結
          </button>
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

            {/* #3 投票進度 + 全員投完提示 */}
            {currentRound.status === 'open' && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-white/40 mb-1">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> 投票進度
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span>{Math.floor(voteProgress.voted / (voteProgress.votesPerPerson || 1))} / {voteProgress.total} 人完成</span>
                    {allVoted && (
                      <span className="text-green-400 font-bold animate-pulse">全員投完！</span>
                    )}
                    {!allVoted && voteProgress.total > 0 && voteProgress.voted > 0 && (
                      <span className="text-yellow-400">
                        還差 {voteProgress.total - voteProgress.voted} 人
                      </span>
                    )}
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      allVoted ? 'bg-green-400' : 'bg-gold-400'
                    )}
                    style={{
                      width: voteProgress.total > 0
                        ? `${Math.min(100, (voteProgress.voted / (voteProgress.total * (voteProgress.votesPerPerson || 1))) * 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                {allVoted && (
                  <p className="text-center text-green-400 text-xs mt-1.5 font-bold animate-bounce">
                    ✓ 全員完成評分，可以長按「結束投票」了
                  </p>
                )}
              </div>
            )}

            {/* 控制按鈕 */}
            <div className="grid grid-cols-2 gap-2">
              {currentRound.status === 'open' && (
                <>
                  {/* #6 長按結束投票按鈕 */}
                  <div className="relative overflow-hidden rounded-xl">
                    <button
                      onPointerDown={handleStopPressStart}
                      onPointerUp={handleStopPressEnd}
                      onPointerLeave={handleStopPressEnd}
                      disabled={actionLoading}
                      className="relative z-10 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                        bg-red-500/20 text-red-300 active:bg-red-500/30
                        disabled:opacity-50 disabled:cursor-not-allowed select-none"
                    >
                      {/* 長按進度條背景 */}
                      <span
                        className="absolute inset-0 bg-red-500/40 rounded-xl transition-none"
                        style={{ width: `${stopPressProgress}%` }}
                      />
                      <span className="relative flex items-center gap-2">
                        <Square size={16} />
                        {stopPressProgress > 0 ? `長按中 ${Math.round(stopPressProgress)}%` : '長按結束投票'}
                      </span>
                    </button>
                  </div>
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
            <h3 className="text-sm font-bold text-gold-200/60 mb-1">根據歡呼聲手動加減分</h3>
            <p className="text-white/25 text-xs mb-3">依現場反應調整各桌分數，完成後點「揭曉結果」</p>
            <div className="space-y-2">
              {tables.map((table) => (
                <div key={table.id} className="flex items-center justify-between py-2">
                  <span className="text-white/60">第 {table.number} 桌</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleManualScore(table.id, -1)}
                      disabled={actionLoading}
                      className="w-11 h-11 rounded-lg bg-red-500/20 text-red-300 flex items-center justify-center
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
                      className="w-11 h-11 rounded-lg bg-green-500/20 text-green-300 flex items-center justify-center
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

        {/* 活動已結束提示 + 重新開始 */}
        {eventStatus === 'finished' && (
          <div className="mb-6 p-6 rounded-xl bg-gold-400/10 border-2 border-gold-400/30 text-center">
            <Trophy className="w-12 h-12 text-gold-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gold-200 mb-2">活動圓滿結束</h2>
            <p className="text-white/40 text-sm mb-4">最終排名已顯示在大螢幕，可查看完整報告</p>
            <div className="flex gap-2">
              <a
                href={`/admin/events/${id}/report`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                  bg-white/5 text-white/60"
              >
                查看報告
              </a>
              <button
                onClick={() => handleAction('reactivate')}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                  bg-gold-400/20 text-gold-200 disabled:opacity-50"
              >
                <RotateCcw size={16} /> 重新開始
              </button>
            </div>
          </div>
        )}

        {/* 操作提示 */}
        {eventStatus !== 'finished' && (
        <div className="mb-4 p-4 rounded-xl bg-gold-400/5 border border-gold-400/20 space-y-2">
          <p className="text-gold-200/80 text-sm font-bold">操作流程</p>
          <ol className="text-white/40 text-xs space-y-1 list-none">
            <li><span className="text-gold-300/60 font-bold mr-1">1.</span>從下方回合列表點「開始」啟動本輪投票</li>
            <li><span className="text-gold-300/60 font-bold mr-1">2.</span>等待所有人完成評分（進度條變綠即全員完成）</li>
            <li><span className="text-gold-300/60 font-bold mr-1">3.</span>長按「結束投票」按鈕 2 秒以停止收票</li>
            <li><span className="text-gold-300/60 font-bold mr-1">4.</span>點「揭曉結果」讓大螢幕顯示本輪排行榜</li>
            <li><span className="text-gold-300/60 font-bold mr-1">5.</span>點「下一輪」繼續進行，或於底部點「最終排名」結束活動</li>
          </ol>
        </div>
        )}

        {/* 回合列表 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-white/30">
              所有回合（{rounds.length} 個）
            </h3>
            <button
              onClick={() => setShowAddRound(!showAddRound)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-gold-400/10 text-gold-200 active:bg-gold-400/20"
            >
              <Plus size={12} /> 新增回合
            </button>
          </div>

          {/* 新增回合表單 */}
          {showAddRound && (
            <div className="p-4 rounded-xl bg-surface-card border border-gold-400/20 mb-2">
              <input
                type="text"
                value={newRoundTitle}
                onChange={(e) => setNewRoundTitle(e.target.value)}
                placeholder="回合名稱（例：安可曲挑戰）"
                className="w-full px-4 py-3 rounded-xl bg-surface-elevated border border-white/10
                  text-white placeholder-white/20 focus:border-gold-400 focus:outline-none mb-3"
              />
              <div className="flex gap-2 mb-3">
                {(['scoring', 'quiz', 'cheer'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setNewRoundType(type)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-xs font-bold transition-colors',
                      newRoundType === type
                        ? 'bg-gold-400/20 text-gold-200 border border-gold-400/30'
                        : 'bg-white/5 text-white/40 border border-white/5'
                    )}
                  >
                    {type === 'scoring' ? '評分' : type === 'quiz' ? '猜謎' : '歡呼'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddRound(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-white/40"
                >
                  取消
                </button>
                <button
                  onClick={() => handleAction('add_round')}
                  disabled={!newRoundTitle.trim() || actionLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold
                    bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
                    disabled:opacity-30"
                >
                  新增
                </button>
              </div>
            </div>
          )}
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
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleAction('delete_round', round.id)}
                    disabled={actionLoading}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400
                      disabled:opacity-50"
                    title="刪除回合"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={() => handleAction('start', round.id)}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/20 text-green-300 text-sm font-bold
                      disabled:opacity-50"
                  >
                    <Play size={16} /> 開始
                  </button>
                </div>
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
        <div className="fixed bottom-0 left-0 right-0 bg-surface-dark/90 backdrop-blur-lg border-t border-white/5">
          {/* 大螢幕模式切換列 */}
          <div className="max-w-lg mx-auto px-4 pt-3 pb-1">
            <p className="text-xs text-white/30 mb-2 flex items-center gap-1.5">
              <Monitor size={11} /> 大螢幕模式
            </p>
            <div className="flex gap-1.5">
              {([
                { key: 'auto', label: '自動', icon: <RefreshCw size={13} /> },
                { key: 'idle', label: 'QR', icon: <QrCode size={13} /> },
                { key: 'leaderboard', label: '排行', icon: <LayoutList size={13} /> },
                { key: 'final', label: '最終', icon: <Trophy size={13} /> },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => handleSetDisplayMode(key)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-0.5 min-h-[44px] py-2 px-0.5 rounded-xl text-xs font-medium transition-colors',
                    displayMode === key
                      ? 'bg-gold-400/20 text-gold-200 border border-gold-400/40'
                      : 'bg-white/5 text-white/40 border border-transparent active:bg-white/10'
                  )}
                >
                  {icon}
                  <span className="text-[10px] leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-lg mx-auto flex gap-2 p-4 pt-2">
            <a
              href={`/display/${eventCode || id}`}
              target="_blank"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm
                bg-white/5 text-white/60 active:bg-white/10"
            >
              <Monitor size={16} /> 大螢幕
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
            {/* #5 複製控制台連結 */}
            <button
              onClick={handleCopyControlLink}
              className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl font-medium text-sm
                bg-white/5 text-white/50 active:bg-white/10"
              title="複製控制台連結"
            >
              {copiedControl ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* #2 分享加入連結 Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-surface-card rounded-2xl p-6 w-full max-w-sm border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gold-200">分享加入連結</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/40"
              >
                <X size={16} />
              </button>
            </div>

            {/* QR Code */}
            <div className="w-56 h-56 bg-white rounded-xl mx-auto flex items-center justify-center p-3 mb-4">
              <QRCodeSVG
                value={joinUrl}
                size={208}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#1A0A00"
              />
            </div>

            {/* 連結 + 複製 */}
            <div className="flex items-center gap-2 bg-surface-elevated rounded-xl px-3 py-2.5 mb-2">
              <span className="flex-1 text-xs text-white/40 truncate font-mono">{joinUrl}</span>
              <button
                onClick={handleCopyJoinLink}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold-400/20 text-gold-200 text-xs font-medium"
              >
                {copiedJoin ? <><Check size={12} /> 已複製</> : <><Copy size={12} /> 複製</>}
              </button>
            </div>
            <p className="text-center text-xs text-white/20">掃描 QR Code 或直接開啟連結加入活動</p>
          </div>
        </div>
      )}
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
