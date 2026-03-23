'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { use } from 'react'
import { ParticleBackground } from '@/components/display/ParticleBackground'
import { Leaderboard } from '@/components/display/Leaderboard'
import { ScoreCounter } from '@/components/display/ScoreCounter'
import { useLiveSync, type LiveState } from '@/hooks/useLiveSync'
import { useLeaderboardStore } from '@/hooks/useLeaderboard'
import { useRoundStore } from '@/hooks/useRound'
import { QRCodeSVG } from 'qrcode.react'
import type { ScoreBoard, Round } from '@/types/database'

type DisplayMode = 'idle' | 'round-intro' | 'voting' | 'counting' | 'reveal' | 'final'

export default function DisplayPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = use(params)
  const [mode, setMode] = useState<DisplayMode>('idle')
  const [eventName, setEventName] = useState('MarketingScore')
  const [voteProgress, setVoteProgress] = useState({ voted: 0, total: 0 })
  const [particleIntensity, setParticleIntensity] = useState<'low' | 'normal' | 'high' | 'celebration'>('low')

  // 記錄上一次的 round status，用於偵測狀態轉換
  const lastRoundStatusRef = useRef<string | null>(null)
  // 排行榜 3 秒 polling ref
  const leaderboardPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { entries, setEntries } = useLeaderboardStore()
  const { currentRound, setCurrentRound, countdown, setCountdown, tick } = useRoundStore()

  // 倒數計時
  useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [countdown, tick])

  // ─── 初始化：取得活動名稱與初始排行榜 ─────────────────────────
  useEffect(() => {
    async function fetchInitial() {
      try {
        const res = await fetch(`/api/results?event_code=${code}`)
        if (res.ok) {
          const data = await res.json()
          if (data.event_name) setEventName(data.event_name)
          if (data.rankings) setEntries(data.rankings as ScoreBoard[])
        }
      } catch {
        // 靜默忽略，useLiveSync 會持續 polling
      }
    }
    fetchInitial()
  }, [code, setEntries])

  // ─── 排行榜 3 秒 polling（voting / reveal 時才跑）─────────────
  const fetchLatestResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/results?event_code=${code}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.rankings) setEntries(data.rankings as ScoreBoard[])
    } catch {
      // 靜默忽略
    }
  }, [code, setEntries])

  useEffect(() => {
    if (leaderboardPollRef.current) {
      clearInterval(leaderboardPollRef.current)
      leaderboardPollRef.current = null
    }

    // 只在需要顯示最新分數的模式才啟動排行榜 polling
    const shouldPoll = mode === 'voting' || mode === 'reveal' || mode === 'counting'
    if (!shouldPoll) return

    leaderboardPollRef.current = setInterval(fetchLatestResults, 3000)
    return () => {
      if (leaderboardPollRef.current) {
        clearInterval(leaderboardPollRef.current)
        leaderboardPollRef.current = null
      }
    }
  }, [mode, fetchLatestResults])

  // ─── useLiveSync：1 秒 polling，偵測回合狀態切換 ──────────────
  const handleRoundChange = useCallback((data: LiveState) => {
    const newStatus = data.current_round_status
    const prevStatus = lastRoundStatusRef.current

    // 狀態真的改變時才更新畫面
    if (newStatus !== prevStatus) {
      lastRoundStatusRef.current = newStatus

      if (newStatus === 'open') {
        // 轉換為 Round 型別
        if (data.current_round_id) {
          setCurrentRound({
            id: data.current_round_id,
            seq: data.current_round_seq ?? 0,
            title: data.current_round_title ?? '',
            type_id: data.current_round_type ?? '',
            status: 'open',
            config: data.current_round_config ?? null,
          } as unknown as Round)
        }
        setMode('voting')
        setParticleIntensity('normal')
        // 立即拉一次排行榜
        fetchLatestResults()
      } else if (newStatus === 'closed') {
        setMode('counting')
        setParticleIntensity('high')
      } else if (newStatus === 'revealed') {
        setMode('reveal')
        setParticleIntensity('celebration')
        // 揭曉時立即拉最新排行榜
        fetchLatestResults()
      } else if (newStatus === null) {
        // 無進行中回合（活動剛開始或回合間空檔）
        if (prevStatus !== null) {
          setMode('idle')
          setParticleIntensity('low')
        }
      }
    }
  }, [setCurrentRound, fetchLatestResults])

  const handleVoteProgress = useCallback((voted: number, total: number) => {
    setVoteProgress({ voted, total })
  }, [])

  useLiveSync(code, handleRoundChange, handleVoteProgress, {
    enabled: true,
    intervalMs: 1000,
  })

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

      {/* polling 模式不需要連線狀態指示器 */}
    </div>
  )
}
