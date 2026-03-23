'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { use } from 'react'
import { ParticleBackground } from '@/components/display/ParticleBackground'
import { Leaderboard } from '@/components/display/Leaderboard'
import { ScoreCounter } from '@/components/display/ScoreCounter'
import { useRealtimeMulti, useEventRealtimeDB, type RealtimeDBPayload } from '@/hooks/useRealtime'
import { useLeaderboardStore } from '@/hooks/useLeaderboard'
import { useRoundStore } from '@/hooks/useRound'
import { CHANNELS } from '@/lib/channels'
import { QRCodeSVG } from 'qrcode.react'
import type { ScoreBoard, Round, RoundStatus } from '@/types/database'

type DisplayMode = 'idle' | 'round-intro' | 'voting' | 'counting' | 'reveal' | 'final'
type ConnectionStatus = 'connected' | 'disconnected'

export default function DisplayPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = use(params)
  const [mode, setMode] = useState<DisplayMode>('idle')
  const [eventName, setEventName] = useState('MarketingScore')
  const [eventId, setEventId] = useState<string | undefined>(undefined)
  const [voteProgress, setVoteProgress] = useState({ voted: 0, total: 0 })
  const [particleIntensity, setParticleIntensity] = useState<'low' | 'normal' | 'high' | 'celebration'>('low')

  // #4 連線狀態
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connected')
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRealtimeRef = useRef<number>(Date.now())
  // #6 debounce：記錄上次 fetch 時間，防止 handleResultsDBChange / handleRoundStatusChange 同時觸發
  const lastFetchRef = useRef<number>(0)

  const { entries, setEntries, updateScore } = useLeaderboardStore()
  const { currentRound, setCurrentRound, countdown, setCountdown, tick } = useRoundStore()

  // 倒數計時
  useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [countdown, tick])

  // ─── 初始化：透過活動代碼取得 event_id（供 DB 訂閱過濾） ──────
  useEffect(() => {
    async function fetchEventId() {
      try {
        const res = await fetch(`/api/results?event_code=${code}`)
        if (res.ok) {
          const data = await res.json()
          if (data.event_id) {
            setEventId(data.event_id)
          }
          if (data.event_name) {
            setEventName(data.event_name)
          }
          // 若有初始排行榜資料
          if (data.rankings) {
            setEntries(data.rankings)
          }
        }
      } catch {
        // 初始化失敗不影響後續 realtime 訂閱
      }
    }
    fetchEventId()
  }, [code, setEntries])

  // ─── #4 Fallback Polling：每 5 秒查 /api/results ─────────────
  // 同時監控 realtime 活躍狀態，若超過 10 秒沒收到訊號則標記斷線
  const fetchLatestResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/results?event_code=${code}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.rankings) setEntries(data.rankings)
      if (data.voted !== undefined && data.total !== undefined) {
        setVoteProgress({ voted: data.voted, total: data.total })
      }
    } catch {
      // 靜默忽略
    }
  }, [code, setEntries])

  useEffect(() => {
    // 每 10 秒監控 realtime 活躍狀態（不主動 fetch，只更新連線指示）
    const connCheckRef = setInterval(() => {
      const elapsed = Date.now() - lastRealtimeRef.current
      if (elapsed > 10000) {
        setConnStatus('disconnected')
      } else {
        setConnStatus('connected')
      }
    }, 5000)

    return () => clearInterval(connCheckRef)
  }, [])

  // #5 Fallback polling：只在斷線或 voting/reveal 模式才啟動
  useEffect(() => {
    if (fallbackPollRef.current) {
      clearInterval(fallbackPollRef.current)
      fallbackPollRef.current = null
    }

    const shouldPoll = connStatus === 'disconnected' || mode === 'voting' || mode === 'reveal'
    if (!shouldPoll) return

    fallbackPollRef.current = setInterval(fetchLatestResults, 5000)

    return () => {
      if (fallbackPollRef.current) {
        clearInterval(fallbackPollRef.current)
        fallbackPollRef.current = null
      }
    }
  }, [connStatus, mode, fetchLatestResults])

  // ─── Broadcast 事件處理（維持相容性，同時接受 broadcast）──────

  // 分數更新（broadcast 來源）
  const handleScoreUpdate = useCallback((payload: Record<string, unknown>) => {
    lastRealtimeRef.current = Date.now()
    setConnStatus('connected')
    const data = payload as {
      rankings?: ScoreBoard[]
      entity_id?: string
      round_id?: string
      score?: number
      voted?: number
      total?: number
    }
    if (data.rankings) {
      setEntries(data.rankings)
    }
    if (data.entity_id && data.round_id && data.score !== undefined) {
      updateScore(data.entity_id, data.round_id, data.score)
    }
    if (data.voted !== undefined && data.total !== undefined) {
      setVoteProgress({ voted: data.voted, total: data.total })
    }
  }, [setEntries, updateScore])

  // 回合狀態變更（broadcast 來源）
  const handleStatusChange = useCallback((payload: Record<string, unknown>) => {
    lastRealtimeRef.current = Date.now()
    setConnStatus('connected')
    const data = payload as { status?: RoundStatus; round?: Record<string, unknown> }
    if (data.status === 'open') {
      setMode('voting')
      setParticleIntensity('normal')
    } else if (data.status === 'closed') {
      setMode('counting')
      setParticleIntensity('high')
    } else if (data.status === 'revealed') {
      setMode('reveal')
      setParticleIntensity('celebration')
    }
  }, [])

  // 主持人指令（broadcast 來源）
  const handleCommand = useCallback((payload: Record<string, unknown>) => {
    lastRealtimeRef.current = Date.now()
    setConnStatus('connected')
    try {
      const data = payload as {
        action?: string
        round?: Round
        countdown?: number
        event_name?: string
      }
      switch (data.action) {
        case 'show_idle':
          setMode('idle')
          setParticleIntensity('low')
          break
        case 'show_round_intro':
          setMode('round-intro')
          setParticleIntensity('normal')
          if (data.round) setCurrentRound(data.round)
          break
        case 'start_countdown':
          if (data.countdown) setCountdown(data.countdown)
          break
        case 'show_final':
          setMode('final')
          setParticleIntensity('celebration')
          break
        case 'init':
          if (data.event_name) setEventName(data.event_name)
          break
      }
    } catch { /* payload 解析錯誤不 crash */ }
  }, [setCurrentRound, setCountdown])

  // 訂閱 broadcast channel（相容舊版廣播）
  useRealtimeMulti(CHANNELS.scores(code), {
    score_update: handleScoreUpdate,
    status_change: handleStatusChange,
    command: handleCommand,
  })

  // ─── DB 層直接訂閱（postgres_changes）──────────────────────────

  // results_cache 更新 → 大螢幕即時分數
  const handleResultsDBChange = useCallback((_payload: RealtimeDBPayload) => {
    lastRealtimeRef.current = Date.now()
    setConnStatus('connected')
    // #6 debounce：300ms 內不重複 fetch
    const now = Date.now()
    if (now - lastFetchRef.current < 300) return
    lastFetchRef.current = now
    // DB 有變化時，重新拉取最新排行榜（直接查 API 最簡單，避免前端組裝邏輯）
    fetch(`/api/results?event_code=${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.rankings) setEntries(data.rankings)
        if (data.voted !== undefined && data.total !== undefined) {
          setVoteProgress({ voted: data.voted, total: data.total })
        }
      })
      .catch(() => { /* 靜默忽略 */ })
  }, [code, setEntries])

  // rounds 狀態變更 → 大螢幕自動切換畫面
  const handleRoundStatusChange = useCallback((newStatus: RoundStatus, roundId: string) => {
    lastRealtimeRef.current = Date.now()
    setConnStatus('connected')
    console.log(`[Display] DB 回合狀態變更: ${roundId} → ${newStatus}`)
    if (newStatus === 'open') {
      // #6 debounce：300ms 內不重複 fetch
      const now = Date.now()
      if (now - lastFetchRef.current < 300) return
      lastFetchRef.current = now
      // 拉取最新回合資訊
      fetch(`/api/results?event_code=${code}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.current_round) {
            setCurrentRound(data.current_round)
          }
        })
        .catch(() => { /* 靜默忽略 */ })
      setMode('voting')
      setParticleIntensity('normal')
    } else if (newStatus === 'closed') {
      setMode('counting')
      setParticleIntensity('high')
    } else if (newStatus === 'revealed') {
      setMode('reveal')
      setParticleIntensity('celebration')
    }
  }, [code, setCurrentRound])

  // 啟用 DB 直接訂閱
  useEventRealtimeDB(eventId, handleResultsDBChange, handleRoundStatusChange)

  return (
    <div className="min-h-screen w-screen theme-golden overflow-hidden relative">
      <ParticleBackground intensity={particleIntensity} />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        {/* 待機畫面 */}
        {mode === 'idle' && (
          <div className="text-center">
            <h1 className="text-6xl font-black animate-shimmer mb-4">
              {eventName}
            </h1>
            <p className="text-2xl text-gold-200/50 mb-8">
              掃描 QR Code 加入活動
            </p>
            <div className="w-72 h-72 bg-white rounded-2xl mx-auto flex items-center justify-center p-4">
              <QRCodeSVG
                value={`${typeof window !== 'undefined' ? window.location.origin : 'https://marketingscore.netlify.app'}/play/${code}`}
                size={256}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#1A0A00"
              />
            </div>
            <p className="text-lg text-gold-200/30 mt-4 font-mono tracking-widest">{code}</p>
          </div>
        )}

        {/* 回合介紹 */}
        {mode === 'round-intro' && currentRound && (
          <div className="text-center">
            <div className="text-2xl text-gold-200/50 mb-4">
              第 {currentRound.seq} 輪
            </div>
            <h2 className="text-7xl font-black glow-gold-strong mb-4">
              {currentRound.title}
            </h2>
          </div>
        )}

        {/* 投票進行中 */}
        {mode === 'voting' && (
          <div className="text-center w-full max-w-3xl">
            <h2 className="text-4xl font-bold glow-gold mb-8">
              {currentRound?.title ?? '投票進行中'}
            </h2>

            {/* 進度條 */}
            <div className="mb-8">
              <div className="flex justify-between text-gold-200/60 mb-2 text-xl">
                <span>已投票</span>
                <span>{voteProgress.voted} / {voteProgress.total}</span>
              </div>
              <div className="w-full h-4 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold-600 to-gold-400 rounded-full transition-all duration-500"
                  style={{
                    width: `${voteProgress.total > 0 ? (voteProgress.voted / voteProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* 倒數 */}
            {countdown !== null && countdown > 0 && (
              <div className={`text-8xl font-black tabular-nums ${countdown <= 5 ? 'text-red-400 animate-heartbeat' : 'glow-gold'}`}>
                {countdown}
              </div>
            )}
          </div>
        )}

        {/* 緊張分數累計 */}
        {mode === 'counting' && (
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gold-200/80 mb-8">
              分數統計中...
            </h2>
            <div className="text-[120px] leading-none">
              <ScoreCounter
                targetScore={entries[0]?.total_score ?? 0}
                duration={5}
                suspense
              />
            </div>
          </div>
        )}

        {/* 排行榜揭曉 */}
        {mode === 'reveal' && (
          <div className="w-full">
            <h2 className="text-4xl font-bold glow-gold text-center mb-8">
              🏆 排行榜揭曉
            </h2>
            <Leaderboard entries={entries} revealing showScores />
          </div>
        )}

        {/* 最終結果 */}
        {mode === 'final' && (
          <div className="w-full">
            <h2 className="text-5xl font-black glow-gold-strong text-center mb-12 animate-shimmer">
              🎉 最終排名 🎉
            </h2>
            <Leaderboard entries={entries} showScores />
          </div>
        )}
      </div>

      {/* #4 連線狀態指示器（右下角） */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        {connStatus === 'disconnected' && (
          <span className="text-xs text-red-400/70 bg-black/40 px-2 py-1 rounded-lg">
            重連中...
          </span>
        )}
        <div
          className={`w-3 h-3 rounded-full ${
            connStatus === 'connected'
              ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]'
              : 'bg-red-400 animate-pulse shadow-[0_0_6px_rgba(248,113,113,0.8)]'
          }`}
          title={connStatus === 'connected' ? '已連線' : '斷線中'}
        />
      </div>
    </div>
  )
}
