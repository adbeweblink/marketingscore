'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { use } from 'react'
import { TableSelector } from '@/components/play/TableSelector'
import { useRealtimeMulti, useRealtimeDB, type RealtimeDBPayload } from '@/hooks/useRealtime'
import { CHANNELS } from '@/lib/channels'
import type { Table, Round, RoundStatus, ScoreBoard } from '@/types/database'

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

// #12: sessionStorage 存取的 key 與結構
interface StoredSession {
  participant: ParticipantInfo
  eventInfo: EventInfo
  tables: Table[]
  token: string
  phase: PlayPhase
  currentRound: Round | null
}

// #8: 快速評分模式的每桌分數狀態
interface TableScore {
  tableId: string
  tableNumber: number
  score: number | null
  submitted: boolean
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

  // #7: toast 訊息
  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string, durationMs = 3000) => {
    setToast(msg)
    setTimeout(() => setToast(null), durationMs)
  }, [])

  // #10 / #11: 排行榜資料
  const [leaderboard, setLeaderboard] = useState<ScoreBoard[]>([])
  const leaderboardTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 取得排行榜
  const fetchLeaderboard = useCallback(async () => {
    if (!code) return
    try {
      const res = await fetch(`/api/results?event_code=${code}`)
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.results)) {
        setLeaderboard(data.results as ScoreBoard[])
      }
    } catch {
      // 靜默忽略
    }
  }, [code])

  // #11: 每 5 秒更新排行榜（waiting / submitted phase 才跑）
  useEffect(() => {
    const shouldPoll = phase === 'waiting' || phase === 'submitted'
    if (shouldPoll) {
      fetchLeaderboard()
      leaderboardTimerRef.current = setInterval(fetchLeaderboard, 5000)
    }
    return () => {
      if (leaderboardTimerRef.current) {
        clearInterval(leaderboardTimerRef.current)
        leaderboardTimerRef.current = null
      }
    }
  }, [phase, fetchLeaderboard])

  // #10: result phase 時也撈一次排行榜
  useEffect(() => {
    if (phase === 'result') {
      fetchLeaderboard()
    }
  }, [phase, fetchLeaderboard])

  // #8: 快速評分狀態
  const [tableScores, setTableScores] = useState<TableScore[]>([])
  const [scoringActiveTable, setScoringActiveTable] = useState<string | null>(null)
  const [pendingScore, setPendingScore] = useState<number>(5)

  // 初始化評分列表（當進入投票且是評分制時）
  useEffect(() => {
    if (phase === 'voting' && currentRound?.type_id === 'scoring' && participant) {
      const othersScores = tables
        .filter((t) => t.number !== participant.table_number)
        .map((t) => ({ tableId: t.id, tableNumber: t.number, score: null, submitted: false }))
      setTableScores(othersScores)
      setScoringActiveTable(null)
    }
  }, [phase, currentRound?.type_id, currentRound?.id, tables, participant])

  // #12: 頁面載入時從 sessionStorage 還原
  useEffect(() => {
    const stored = sessionStorage.getItem(`ms_participant_${code}`)
    if (!stored) return
    try {
      const session: StoredSession = JSON.parse(stored)
      tokenRef.current = session.token
      setParticipant(session.participant)
      setEventInfo(session.eventInfo)
      setTables(session.tables)
      setCurrentRound(session.currentRound)
      // 還原到 waiting 或 voting（不還原 join/result/submitted）
      const restoredPhase: PlayPhase =
        session.phase === 'voting' || session.phase === 'waiting'
          ? session.phase
          : 'waiting'
      setPhase(restoredPhase)
      showToast('已自動恢復上次連線')
    } catch {
      sessionStorage.removeItem(`ms_participant_${code}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // #12: 更新 sessionStorage（phase 改變時同步）
  useEffect(() => {
    if (!participant || !eventInfo || !tokenRef.current) return
    const session: StoredSession = {
      participant,
      eventInfo,
      tables,
      token: tokenRef.current,
      phase,
      currentRound,
    }
    sessionStorage.setItem(`ms_participant_${code}`, JSON.stringify(session))
  }, [phase, participant, eventInfo, tables, currentRound, code])

  // #7: 監聽 visibilitychange 重新同步狀態
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (phase === 'join') return

      try {
        const res = await fetch(`/api/results?event_code=${code}`)
        if (!res.ok) return
        const data = await res.json()
        // 同步排行榜
        if (Array.isArray(data.results)) {
          setLeaderboard(data.results as ScoreBoard[])
        }
        showToast('已重新連線')
      } catch {
        // 靜默忽略
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [phase, code, showToast])

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

  // 投票（原有，供猜謎制 / 歡呼制使用）
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

  // #8: 快速評分 — 送出單桌分數
  async function handleQuickScore(tableId: string, score: number) {
    if (!participant || !currentRound || !tokenRef.current) return

    // 先標記為已送出
    setTableScores((prev) =>
      prev.map((ts) => ts.tableId === tableId ? { ...ts, score, submitted: true } : ts)
    )
    setScoringActiveTable(null)

    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          round_id: currentRound.id,
          target_table_id: tableId,
          score,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '評分失敗')
        // 回滾
        setTableScores((prev) =>
          prev.map((ts) => ts.tableId === tableId ? { ...ts, score: null, submitted: false } : ts)
        )
      }
    } catch {
      setError('評分失敗，請重試')
      setTableScores((prev) =>
        prev.map((ts) => ts.tableId === tableId ? { ...ts, score: null, submitted: false } : ts)
      )
    }
  }

  // #8: 全部評分送出後切換到 submitted
  useEffect(() => {
    if (
      phase === 'voting' &&
      currentRound?.type_id === 'scoring' &&
      tableScores.length > 0 &&
      tableScores.every((ts) => ts.submitted)
    ) {
      setPhase('submitted')
    }
  }, [tableScores, phase, currentRound?.type_id])

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
  useRealtimeDB<{ id: string; status: RoundStatus; event_id: string }>(
    'rounds',
    eventInfo?.id ? `event_id=eq.${eventInfo.id}` : undefined,
    undefined,
    useCallback((payload: RealtimeDBPayload<{ id: string; status: RoundStatus; event_id: string }>) => {
      const newStatus = payload.new?.status
      if (!newStatus) return

      if (newStatus === 'open') {
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
        setPhase('result')
      }
    }, [code, eventInfo?.id])
  )

  // ─── #11: 找到自己桌的排行榜位置 ────────────────────────────────
  const myRankEntry = leaderboard.find(
    (entry) => participant && entry.entity_id === participant.table_id
  )
  const myRank = leaderboard.findIndex(
    (entry) => participant && entry.entity_id === participant.table_id
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

      {/* ─── Waiting Phase ───────────────────────────────────── */}
      {phase === 'waiting' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="text-6xl mb-4 animate-pulse">🎵</div>
          <h2 className="text-2xl font-bold text-gold-200 mb-3">
            {currentRound ? currentRound.title : '等待主持人開始'}
          </h2>
          <p className="text-white/50 text-base mb-2">
            {currentRound ? '即將開始，請準備！' : '活動開始時畫面會自動切換'}
          </p>

          {/* #9: 顯示目前輪數 */}
          {currentRound && (
            <div className="mb-4 px-4 py-1.5 rounded-full bg-gold-400/10 border border-gold-400/30">
              <span className="text-gold-300 text-sm font-semibold">
                第 {currentRound.seq} 輪
              </span>
            </div>
          )}

          <div className="px-5 py-3 rounded-2xl bg-surface-card border border-white/10 inline-block mb-4">
            <span className="text-gold-200 font-bold">{participant?.display_name}</span>
            <span className="text-white/30 mx-2">·</span>
            <span className="text-gold-400 font-bold">第 {participant?.table_number} 桌</span>
          </div>

          {/* #11: 我的桌目前排名 */}
          {myRankEntry && myRank >= 0 && (
            <div className="mt-2 px-5 py-3 rounded-2xl bg-surface-card border border-gold-400/20 inline-flex items-center gap-3">
              <span className="text-white/50 text-sm">目前排名</span>
              <span className="text-gold-300 font-black text-xl">#{myRank + 1}</span>
              <span className="text-white/30">·</span>
              <span className="text-white/70 text-sm">{myRankEntry.total_score} 分</span>
            </div>
          )}

          <p className="text-white/20 text-xs mt-6">
            📱 不用重新整理，畫面會自動更新
          </p>
        </div>
      )}

      {/* ─── Voting Phase ────────────────────────────────────── */}
      {phase === 'voting' && currentRound && (
        <div className="min-h-screen flex flex-col items-center justify-start px-4 pt-10 pb-8">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-gold-200/60">
              {currentRound.title}
            </h2>
            {/* #9: 顯示輪數 */}
            <p className="text-gold-400/50 text-xs mt-1">第 {currentRound.seq} 輪</p>
          </div>

          {/* 評分制 — 快速評分模式 #8 */}
          {currentRound.type_id === 'scoring' && (
            <div className="w-full max-w-sm mx-auto">
              {/* 進度 */}
              <div className="text-center mb-4">
                <span className="text-white/40 text-sm">
                  已評 {tableScores.filter((ts) => ts.submitted).length} / {tableScores.length} 桌
                </span>
              </div>

              {/* 桌號 grid */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {tableScores.map((ts) => (
                  <button
                    key={ts.tableId}
                    onClick={() => {
                      if (ts.submitted) return
                      setScoringActiveTable(ts.tableId)
                      setPendingScore(Math.ceil(((currentRound.config?.scale_min ?? 1) + (currentRound.config?.scale_max ?? 10)) / 2))
                    }}
                    className={[
                      'py-4 rounded-xl text-center transition-all font-bold text-lg border',
                      ts.submitted
                        ? 'bg-green-900/30 border-green-500/40 text-green-400 cursor-default'
                        : scoringActiveTable === ts.tableId
                          ? 'bg-gold-400/20 border-gold-400/60 text-gold-200'
                          : 'bg-surface-card border-white/10 text-white/80 active:scale-95',
                    ].join(' ')}
                  >
                    {ts.submitted ? (
                      <span className="flex flex-col items-center gap-1">
                        <span className="text-green-400 text-xl">✓</span>
                        <span className="text-xs text-green-300/70">{ts.score} 分</span>
                      </span>
                    ) : (
                      <span className="flex flex-col items-center gap-0.5">
                        <span>第 {ts.tableNumber} 桌</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* 彈出評分區塊 */}
              {scoringActiveTable && (() => {
                const activeTs = tableScores.find((ts) => ts.tableId === scoringActiveTable)
                if (!activeTs) return null
                const min = currentRound.config?.scale_min ?? 1
                const max = currentRound.config?.scale_max ?? 10
                return (
                  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setScoringActiveTable(null)}
                  >
                    <div
                      className="w-full max-w-sm bg-surface-card rounded-t-3xl p-6 pb-10 border border-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-center mb-4">
                        <p className="text-white/50 text-sm mb-1">為</p>
                        <p className="text-gold-200 text-xl font-bold">第 {activeTs.tableNumber} 桌</p>
                        <p className="text-white/50 text-sm mt-1">打幾分？</p>
                      </div>

                      {/* 快速數字按鈕 */}
                      <div className="grid grid-cols-5 gap-2 mb-5">
                        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
                          <button
                            key={v}
                            onClick={() => setPendingScore(v)}
                            className={[
                              'py-3 rounded-xl text-lg font-black border transition-all',
                              pendingScore === v
                                ? 'bg-gold-400 text-surface-dark border-gold-400 shadow-[0_0_12px_rgba(255,179,0,0.5)]'
                                : 'bg-surface-elevated border-white/10 text-white/70',
                            ].join(' ')}
                          >
                            {v}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => handleQuickScore(scoringActiveTable, pendingScore)}
                        className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark shadow-[0_0_15px_rgba(255,179,0,0.3)]"
                      >
                        送出 {pendingScore} 分
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* 猜謎制（不變） */}
          {currentRound.type_id === 'quiz' && (
            <QuizOptionsInline
              question={currentRound.config?.question ?? '猜猜這是哪一桌？'}
              options={tables.map((t) => ({
                id: t.id,
                label: t.name ?? `第 ${t.number} 桌`,
                disabled: t.number === participant?.table_number,
              }))}
              onSubmit={(selectedId) => handleVote(selectedId, undefined, selectedId)}
            />
          )}

          {/* 歡呼制 */}
          {currentRound.type_id === 'cheer' && (
            <div className="text-center py-8 px-6">
              <div className="text-7xl mb-4 animate-bounce">👏</div>
              <h2 className="text-2xl font-bold text-gold-200 mb-3">
                用力歡呼！
              </h2>
              <p className="text-white/50 text-base">
                本輪由主持人根據歡呼聲決定分數
                <br />
                <span className="text-gold-400">大聲喊出你支持的桌號吧！</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Submitted Phase ─────────────────────────────────── */}
      {phase === 'submitted' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gold-200 mb-3">投票成功！</h2>
          <p className="text-white/50 text-base mb-4">
            等待其他人投完，主持人會揭曉結果
          </p>

          {/* #11: 我的桌目前排名 */}
          {myRankEntry && myRank >= 0 && (
            <div className="mb-4 px-5 py-3 rounded-2xl bg-surface-card border border-gold-400/20 inline-flex items-center gap-3">
              <span className="text-white/50 text-sm">你的桌</span>
              <span className="text-gold-300 font-black text-xl">#{myRank + 1}</span>
              <span className="text-white/30">·</span>
              <span className="text-white/70 text-sm">{myRankEntry.total_score} 分</span>
            </div>
          )}

          <p className="text-white/20 text-xs">
            👀 結果揭曉時請看大螢幕
            <br />
            📱 下一輪開始時畫面會自動切換
          </p>
        </div>
      )}

      {/* ─── Result Phase ────────────────────────────────────── */}
      {phase === 'result' && (
        <div className="min-h-screen flex flex-col px-4 pt-8 pb-10">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🏆</div>
            <h2 className="text-2xl font-bold text-gold-200 mb-1">結果揭曉！</h2>
            <p className="text-white/40 text-sm">📱 下一輪開始時畫面會自動切換</p>
          </div>

          {/* #10: 手機上顯示精簡排行榜 */}
          {leaderboard.length > 0 ? (
            <div className="w-full max-w-sm mx-auto space-y-2">
              {leaderboard.map((entry, idx) => {
                const rank = idx + 1
                const isMyTable = participant && entry.entity_id === participant.table_id
                const rankEmoji = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
                return (
                  <div
                    key={entry.entity_id}
                    className={[
                      'flex items-center gap-3 px-4 py-3 rounded-xl border',
                      isMyTable
                        ? 'bg-gold-400/15 border-gold-400/50'
                        : rank <= 3
                          ? 'bg-white/8 border-white/15'
                          : 'bg-surface-card border-white/8',
                    ].join(' ')}
                  >
                    <span className="w-10 text-center text-2xl font-black flex-shrink-0">
                      {rankEmoji}
                    </span>
                    <span className="flex-1 font-bold text-white/90 truncate">
                      {entry.entity_name}
                      {isMyTable && (
                        <span className="ml-2 text-gold-400 text-xs">← 我的桌</span>
                      )}
                    </span>
                    <span className="text-gold-300 font-black text-xl tabular-nums">
                      {entry.total_score}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center text-white/30 text-sm mt-6">
              載入排行榜中...
            </div>
          )}
        </div>
      )}

      {/* ─── Error toast ────────────────────────────────────── */}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-center text-sm z-40">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">關閉</button>
        </div>
      )}

      {/* ─── #7: 重新連線 toast ──────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 p-3 rounded-xl bg-green-600/30 border border-green-400/40 text-green-200 text-center text-sm z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── 內嵌猜謎選項元件（避免 import QuizOptions 需要調整 prop 型別）──────
interface QuizOption { id: string; label: string; disabled?: boolean }

function QuizOptionsInline({
  question,
  options,
  onSubmit,
}: {
  question: string
  options: QuizOption[]
  onSubmit: (id: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function handleSelect(id: string) {
    if (submitted) return
    setSelected(id)
    setSubmitted(true)
    onSubmit(id)
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <p className="text-white/80 text-base font-medium text-center mb-6">{question}</p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => !opt.disabled && handleSelect(opt.id)}
            disabled={opt.disabled || submitted}
            className={[
              'py-4 rounded-xl font-bold text-base border transition-all',
              opt.disabled
                ? 'opacity-30 cursor-not-allowed bg-surface-card border-white/5 text-white/40'
                : selected === opt.id
                  ? 'bg-gold-400/30 border-gold-400/60 text-gold-200'
                  : 'bg-surface-card border-white/10 text-white/80 active:scale-95',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {submitted && (
        <p className="text-center text-green-400 text-sm mt-4">✓ 已送出</p>
      )}
    </div>
  )
}
