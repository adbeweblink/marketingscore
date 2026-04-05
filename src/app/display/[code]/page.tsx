'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { use } from 'react'
import { ParticleBackground } from '@/components/display/ParticleBackground'
import { Leaderboard } from '@/components/display/Leaderboard'
import { ScoreCounter } from '@/components/display/ScoreCounter'
import { VoteBalls } from '@/components/display/VoteBalls'
import { useLiveSync, type LiveState } from '@/hooks/useLiveSync'
import { resolveCurrentRound, resolveDisplayMode, type DisplayMode } from '@/hooks/useEventState'
import { useLeaderboardStore } from '@/hooks/useLeaderboard'
import { useRoundStore } from '@/hooks/useRound'
import { QRCodeSVG } from 'qrcode.react'
import type { ScoreBoard, Round, Group } from '@/types/database'


export default function DisplayPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = use(params)
  const [mode, setMode] = useState<DisplayMode>('idle')
  const [eventName, setEventName] = useState('載入中...')
  const [voteProgress, setVoteProgress] = useState({ voted: 0, total: 0 })
  const [recentVoters, setRecentVoters] = useState<string[]>([])
  const [particleIntensity, setParticleIntensity] = useState<'low' | 'normal' | 'high' | 'celebration'>('low')
  // 主持人手動覆蓋模式（'auto' = 跟隨回合狀態）
  const [manualDisplayMode, setManualDisplayMode] = useState<string>('auto')

  // 記錄上一次的 round status，用於偵測狀態轉換
  const lastRoundStatusRef = useRef<string | null>(null)
  // 排行榜 3 秒 polling ref
  const leaderboardPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 組別排名切換
  // 組別排行已改為自動判斷（groups.length > 0 直接顯示組排名）
  // 活動分組設定（從 API 初始化時拉取）
  const [groups, setGroups] = useState<Group[]>([])

  const { entries, setEntries } = useLeaderboardStore()
  const { currentRound, setCurrentRound, countdown, setCountdown, tick } = useRoundStore()

  // 倒數計時
  useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [countdown, tick])

  // ─── 初始化：取得活動名稱、初始排行榜與分組設定 ─────────────────
  useEffect(() => {
    async function fetchInitial() {
      try {
        const [resultsRes, groupsRes] = await Promise.all([
          fetch(`/api/results?event_code=${code}`),
          fetch(`/api/events/${code}/groups`),
        ])
        if (resultsRes.ok) {
          const data = await resultsRes.json()
          if (data.event_name) setEventName(data.event_name)
          if (data.results) setEntries(data.results as ScoreBoard[])
        }
        if (groupsRes.ok) {
          const gData = await groupsRes.json()
          if (gData.groups) setGroups(gData.groups as Group[])
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
      if (data.results) setEntries(data.results as ScoreBoard[])
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

  // ─── 組別排名（從桌次分數聚合計算）─────────────────────────────
  const groupRankings = useMemo<ScoreBoard[]>(() => {
    if (groups.length === 0 || entries.length === 0) return []

    // 建立 table_id → score 對照表
    const tableScoreMap = new Map<string, number>(
      entries.filter((e) => e.entity_type === 'table').map((e) => [e.entity_id, e.total_score])
    )

    const groupScores = groups.map((g) => {
      const totalScore = g.table_ids.reduce((sum: number, tid: string) => sum + (tableScoreMap.get(tid) ?? 0), 0)
      const roundScores: Record<string, number> = {}
      // 從各桌的 round_scores 聚合
      for (const tid of g.table_ids) {
        const tableEntry = entries.find((e) => e.entity_id === tid)
        if (tableEntry) {
          for (const [roundId, score] of Object.entries(tableEntry.round_scores)) {
            roundScores[roundId] = (roundScores[roundId] ?? 0) + score
          }
        }
      }
      // 找出組內桌號備註
      const tableNumbers = (g.table_ids ?? [])
        .map((tid: string) => entries.find(e => e.entity_id === tid)?.entity_number)
        .filter((n): n is number => n != null)
        .sort((a, b) => a - b)

      return {
        entity_type: 'group' as const,
        entity_id: g.id,
        entity_name: `${g.name}`,
        entity_number: undefined,
        total_score: totalScore,
        round_scores: roundScores,
        // 備註哪幾桌（Leaderboard 會讀 entity_name 後面的副標題）
        subtitle: tableNumbers.length > 0 ? `第 ${tableNumbers.join('、')} 桌` : undefined,
      }
    })

    return groupScores.sort((a, b) => b.total_score - a.total_score)
  }, [groups, entries])

  // ─── useLiveSync：1 秒 polling，偵測回合狀態切換 ──────────────
  const handleRoundChange = useCallback((data: LiveState) => {
    // 更新手動模式標記
    const apiDisplayMode = data.display_mode ?? 'auto'
    setManualDisplayMode(apiDisplayMode)

    // 用共用推導函式計算目前應顯示的模式
    const currentRound = resolveCurrentRound(data.rounds)
    const resolvedMode = resolveDisplayMode(currentRound, data.event_status, apiDisplayMode)

    // 偵測 round status 是否真的改變（避免不必要的重渲染）
    const newStatus = data.current_round_status
    const prevStatus = lastRoundStatusRef.current
    const modeChanged = resolvedMode !== mode || newStatus !== prevStatus
    lastRoundStatusRef.current = newStatus

    if (!modeChanged) return

    setMode(resolvedMode)

    // 根據新模式設定粒子強度與觸發排行榜更新
    if (resolvedMode === 'reveal' || resolvedMode === 'final') {
      setParticleIntensity('celebration')
      fetchLatestResults()
    } else if (resolvedMode === 'counting') {
      setParticleIntensity('high')
      fetchLatestResults() // counting 時也要拉排行榜才有分數可顯示
    } else if (resolvedMode === 'voting') {
      setParticleIntensity('normal')
      // open 回合時同步 currentRound 給倒數計時器用
      if (currentRound && data.current_round_id) {
        setCurrentRound({
          id: data.current_round_id,
          seq: data.current_round_seq ?? 0,
          title: data.current_round_title ?? '',
          type_id: data.current_round_type ?? '',
          status: 'open',
          config: data.current_round_config ?? null,
        } as unknown as Round)
      }
      fetchLatestResults()
    } else {
      setParticleIntensity('low')
    }

    // 同步倒數計時（從 server 端的 countdown_end 時間戳計算剩餘秒數）
    if (data.countdown_end) {
      const remaining = Math.max(0, Math.ceil((new Date(data.countdown_end).getTime() - Date.now()) / 1000))
      if (remaining > 0) {
        setCountdown(remaining)
      }
    }
  }, [mode, setCurrentRound, setCountdown, fetchLatestResults])

  const handleVoteProgress = useCallback((voted: number, total: number) => {
    setVoteProgress({ voted, total })
  }, [])

  const handleVotersUpdate = useCallback((voters: string[]) => {
    setRecentVoters(voters)
  }, [])

  useLiveSync(code, handleRoundChange, handleVoteProgress, {
    enabled: true,
    intervalMs: 1000,
  }, handleVotersUpdate)

  const isManualMode = manualDisplayMode !== 'auto'

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
            <p className="text-2xl text-gold-200/50 mb-2">
              掃描 QR Code 或輸入代碼加入
            </p>
            <div className="w-96 h-96 bg-white rounded-2xl mx-auto flex items-center justify-center p-4 mt-6">
              <QRCodeSVG
                value={`${typeof window !== 'undefined' ? window.location.origin : 'https://marketingscore.netlify.app'}/play/${code}`}
                size={360}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#1A0A00"
              />
            </div>
            <p className="text-xl text-gold-200/40 mt-4 font-mono tracking-widest">{code}</p>
          </div>
        )}

        {/* 回合介紹 */}
        {mode === 'round-intro' && currentRound && (
          <div className="text-center">
            <div className="text-2xl text-gold-200/50 mb-4">
              第 {currentRound.seq} 輪
            </div>
            <h2 className="text-7xl font-black animate-shimmer mb-4">
              {currentRound.title}
            </h2>
          </div>
        )}

        {/* 投票金球（voting 模式時飛出） */}
        {mode === 'voting' && <VoteBalls voters={recentVoters} />}

        {/* 投票進行中 */}
        {mode === 'voting' && (
          <div className="text-center w-full max-w-3xl">
            <p className="text-xl animate-shimmer mb-2 tracking-wide">評分進行中</p>
            <h2 className="text-4xl font-black animate-shimmer mb-8">
              {currentRound?.title ?? '請用手機完成評分'}
            </h2>

            {/* 進度條 */}
            <div className="mb-8">
              <div className="flex justify-between text-gold-200/60 mb-2 text-xl">
                <span>已完成評分</span>
                <span>{voteProgress.voted} / {voteProgress.total} 人</span>
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
              <div className="mt-8">
                <div className={`text-[10rem] leading-none font-black tabular-nums ${countdown <= 5 ? 'text-battle-red animate-heartbeat' : 'animate-shimmer'}`}>
                  {countdown}
                </div>
                <div className="text-xl text-gold-200/50 mt-2">剩餘時間</div>
              </div>
            )}
          </div>
        )}

        {/* 緊張分數累計 */}
        {mode === 'counting' && (
          <div className="text-center">
            <h2 className="text-3xl font-bold animate-shimmer mb-8">
              正在統計分數
            </h2>
            <div className="text-[120px] leading-none">
              <ScoreCounter
                targetScore={
                  (entries)[0]?.total_score ?? 0
                }
                duration={5}
                suspense
              />
            </div>
          </div>
        )}

        {/* 排行榜揭曉 */}
        {mode === 'reveal' && (
          <div className="w-full">
            <h2 className="text-5xl font-black animate-shimmer text-center mb-8">
              本輪排行榜
            </h2>
            <Leaderboard
              entries={entries}
              revealing
              showScores
            />
          </div>
        )}

        {/* 最終結果 */}
        {mode === 'final' && (
          <div className="w-full">
            <h2 className="text-6xl font-black animate-shimmer text-center mb-12">
              最終排名
            </h2>
            <Leaderboard
              entries={entries}
              showScores
            />
          </div>
        )}
      </div>

      {/* 手動模式角標：主持人手動控制時顯示，讓主持人知道目前是手動覆蓋 */}
      {isManualMode && (
        <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-400/20 border border-gold-400/30 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
          <span className="text-gold-200/70 text-xs font-medium">手動模式</span>
        </div>
      )}
    </div>
  )
}
