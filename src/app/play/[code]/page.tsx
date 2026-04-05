'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { use } from 'react'
import { TableSelector } from '@/components/play/TableSelector'
import { QuizOptions } from '@/components/play/QuizOptions'
import { useLiveSync, type LiveState } from '@/hooks/useLiveSync'
import { resolvePlayPhase, type PlayPhase } from '@/hooks/useEventState'
import { cn } from '@/lib/utils'
import { RANK_EMOJI } from '@/lib/constants'
import type { Table, Round, ScoreBoard } from '@/types/database'

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
  // 有分組時的額外欄位
  groupId?: string
  groupName?: string
}

export default function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = use(params)
  const SESSION_KEY = `ms_participant_${code}`
  const [phase, setPhase] = useState<PlayPhase>('join')
  const phaseRef = useRef<PlayPhase>('join') // stale closure 防護
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null)
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [groups, setGroups] = useState<import('@/types/database').Group[]>([])
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)

  // 倒數計時 tick
  useEffect(() => {
    if (countdown === null || countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => prev !== null && prev > 0 ? prev - 1 : null)
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])
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

  // results API 已根據有無分組自動回傳正確類型（group 或 table），不需前端再聚合

  // 同步 phaseRef
  useEffect(() => { phaseRef.current = phase }, [phase])

  // useLiveSync：1 秒 polling，偵測回合狀態變化
  const handleRoundChange = useCallback((data: LiveState) => {
    const currentPhase = phaseRef.current
    const { shouldVote, shouldResult } = resolvePlayPhase(data.rounds, currentPhase)

    if (shouldVote) {
      const openRound = data.rounds.find((r) => r.status === 'open')
      if (openRound) setCurrentRound(openRound as unknown as Round)
      setPhase('voting')
    } else if (shouldResult) {
      setPhase('result')
    }

    // 同步倒數計時
    if (data.countdown_end) {
      const remaining = Math.max(0, Math.ceil((new Date(data.countdown_end).getTime() - Date.now()) / 1000))
      setCountdown(remaining > 0 ? remaining : null)
    }
  }, [])

  const { syncNow } = useLiveSync(
    code,
    handleRoundChange,
    // 手機端不需要處理 vote_count（不顯示投票進度條），傳空函式
    useCallback(() => { /* 手機端不使用投票進度 */ }, []),
    {
      // 只在加入後才啟動 polling（join phase 不需要）
      enabled: phase !== 'join',
      intervalMs: 1000,
    }
  )

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

  // 初始化評分列表（只在回合 ID 真正改變或首次進入 voting 時重置）
  const lastInitRoundRef = useRef<string | null>(null)
  useEffect(() => {
    if (phase === 'voting' && (currentRound?.type_id === 'scoring' || currentRound?.type_id === 'custom') && participant) {
      // 同一回合不重置（防止倒數等事件觸發重跑）
      if (lastInitRoundRef.current === currentRound.id) return
      lastInitRoundRef.current = currentRound.id

      if (groups.length > 0) {
        const myGroup = groups.find(g => g.table_ids?.includes(participant.table_id))
        const otherGroups = groups.filter(g => g.id !== myGroup?.id)
        const groupScores: TableScore[] = otherGroups.map(g => ({
          tableId: g.table_ids?.[0] ?? g.id,
          tableNumber: 0,
          score: null,
          submitted: false,
          groupId: g.id,
          groupName: g.name,
        }))
        setTableScores(groupScores)
      } else {
        const othersScores = tables
          .filter((t) => t.number !== participant.table_number)
          .map((t) => ({ tableId: t.id, tableNumber: t.number, score: null, submitted: false }))
        setTableScores(othersScores)
      }
      setScoringActiveTable(null)
    }
  }, [phase, currentRound?.type_id, currentRound?.id, tables, participant, groups])

  // 初始化：fetch 活動名稱和桌次（join 階段就需要顯示）
  useEffect(() => {
    if (eventInfo) return // 已有資料不重複 fetch
    async function fetchEventInfo() {
      try {
        const res = await fetch(`/api/events/${code}/status`)
        if (!res.ok) {
          if (res.status === 404) {
            setError('找不到此活動，請確認活動代碼是否正確')
          }
          return
        }
        const data = await res.json()
        if (data.error) {
          setError(data.error)
          return
        }
        setEventInfo({ id: data.event_id, name: data.event_name, code })
        if (data.tables?.length > 0) setTables(data.tables)

        // 拉取分組
        try {
          const gRes = await fetch(`/api/events/${code}/groups`)
          if (gRes.ok) {
            const gData = await gRes.json()
            if (gData.groups?.length > 0) setGroups(gData.groups)
          }
        } catch { /* 沒分組也沒關係 */ }
      } catch {
        setError('無法連線，請檢查網路')
      }
    }
    fetchEventInfo()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // #12: 頁面載入時從 sessionStorage 還原
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
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

      // sessionStorage 還原後，fetchEventInfo 會因 eventInfo 已設定而跳過，
      // 需在此補拉 groups，否則分組選桌模式會顯示空
      fetch(`/api/events/${code}/groups`)
        .then(r => r.ok ? r.json() : null)
        .then(gData => {
          if (gData?.groups?.length > 0) setGroups(gData.groups)
        })
        .catch(() => { /* 沒分組也沒關係 */ })
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }, [phase, participant, eventInfo, tables, currentRound, code])

  // #7: 監聽 visibilitychange 重新同步狀態
  // Bug 12 fix: 呼叫 syncNow() 同步回合狀態，不只拉排行榜
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (phase === 'join') return

      // 同步回合狀態
      syncNow()

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
  }, [phase, code, showToast, syncNow])

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
        showToast('✅ 投票成功！')
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

    const rollbackScore = () => {
      setTableScores((prev) =>
        prev.map((ts) => ts.tableId === tableId ? { ...ts, score: null, submitted: false } : ts)
      )
    }

    // 先標記為已送出
    setTableScores((prev) =>
      prev.map((ts) => ts.tableId === tableId ? { ...ts, score, submitted: true } : ts)
    )
    setScoringActiveTable(null)

    const ts = tableScores.find(t => t.tableId === tableId)
    const isGroupMode = !!ts?.groupId

    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          round_id: currentRound.id,
          ...(isGroupMode
            ? { target_group_id: ts!.groupId }
            : { target_table_id: tableId }),
          score,
        }),
      })

      if (res.ok) {
        if (isGroupMode) {
          showToast(`✅ ${ts!.groupName} 組 ${score} 分已送出`)
        } else {
          showToast(`✅ 第 ${ts?.tableNumber} 桌 ${score} 分已送出`)
        }
      } else {
        const data = await res.json()
        setError(data.error ?? '評分失敗')
        rollbackScore()
      }
    } catch {
      setError('評分失敗，請重試')
      rollbackScore()
    }
  }

  // #8: 全部評分送出後切換到 submitted
  useEffect(() => {
    if (
      phase === 'voting' &&
      (currentRound?.type_id === 'scoring' || currentRound?.type_id === 'custom') &&
      tableScores.length > 0 &&
      tableScores.every((ts) => ts.submitted)
    ) {
      setPhase('submitted')
    }
  }, [tableScores, phase, currentRound?.type_id])

  // ─── #11: 找到自己桌的排行榜位置 ────────────────────────────────
  const myRank = leaderboard.findIndex(e => participant && e.entity_id === participant.table_id)
  const myRankEntry = myRank >= 0 ? leaderboard[myRank] : undefined

  // ─── #11: 評分制彈出面板（IIFE 提取為變數）─────────────────────
  const scoringPanel = (() => {
    if (!scoringActiveTable || !currentRound) return null
    const activeTs = tableScores.find((ts) => ts.tableId === scoringActiveTable)
    if (!activeTs) return null
    const min = currentRound.config?.scale_min ?? 1
    const max = currentRound.config?.scale_max ?? 10
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
        onClick={() => setScoringActiveTable(null)}
      >
        <div
          className="w-full max-w-lg bg-surface-card rounded-t-3xl p-6 border border-white/10 pb-[max(2.5rem,env(safe-area-inset-bottom))]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center mb-4">
            {activeTs.groupName ? (
              <>
                <p className="text-white/50 text-sm mb-1">為以下組別打分</p>
                <p className="text-gold-200 text-xl font-bold">{activeTs.groupName} 組</p>
              </>
            ) : (
              <>
                <p className="text-white/50 text-sm mb-1">為以下桌號打分</p>
                <p className="text-gold-200 text-xl font-bold">第 {activeTs.tableNumber} 桌</p>
              </>
            )}
            <p className="text-white/50 text-sm mt-1">選擇分數後點「送出」</p>
          </div>

          {/* 快速數字按鈕 */}
          <div className="grid grid-cols-5 gap-2 mb-5">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
              <button
                key={v}
                onClick={() => setPendingScore(v)}
                className={cn(
                  'min-h-[48px] py-2 rounded-xl text-base font-black border transition-all',
                  pendingScore === v
                    ? 'bg-gold-400 text-surface-dark border-gold-400 shadow-[0_0_12px_rgba(255,179,0,0.5)]'
                    : 'bg-surface-elevated border-white/10 text-white/70',
                )}
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
  })()

  return (
    <div className="min-h-screen bg-surface-dark">
      {phase === 'join' && (
        <TableSelector
          tables={tables.length > 0 ? tables : []}
          groups={groups}
          eventName={eventInfo?.name ?? '載入中...'}
          onJoin={handleJoin}
          loading={loading}
        />
      )}

      {/* ─── Waiting Phase ───────────────────────────────────── */}
      {phase === 'waiting' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="w-12 h-12 border-2 border-white/10 border-t-gold-400 rounded-full animate-spin mb-6" />
          <h2 className="text-2xl font-bold text-gold-200 mb-2">
            {currentRound ? currentRound.title : '等待主持人開始回合'}
          </h2>
          <p className="text-white/50 text-base mb-2">
            {currentRound ? '主持人即將開放投票，請保持待機' : '主持人開始後，畫面將自動跳轉至投票頁'}
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

          <p className="text-white/20 text-xs mt-4">
            畫面將自動更新，無需手動操作
          </p>

          {/* 備案：手動重整按鈕 */}
          <button
            onClick={() => {
              syncNow()
              showToast('已手動同步')
            }}
            className="mt-4 px-6 py-2.5 rounded-xl text-sm font-medium
              bg-white/5 text-white/40 border border-white/10
              active:bg-white/10 transition-colors"
          >
            畫面未更新？點此手動同步
          </button>
        </div>
      )}

      {/* ─── Voting Phase ────────────────────────────────────── */}
      {phase === 'voting' && currentRound && (
        <div className="min-h-screen flex flex-col items-center justify-start px-4 pt-4 pb-[env(safe-area-inset-bottom,24px)]" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-gold-200/60">
              {currentRound.title}
            </h2>
            {/* #9: 顯示輪數 */}
            <p className="text-gold-400/50 text-xs mt-1">第 {currentRound.seq} 輪</p>
            {/* 倒數計時 */}
            {countdown !== null && countdown > 0 && (
              <div className={`mt-3 text-5xl font-black tabular-nums ${countdown <= 5 ? 'text-red-400 animate-pulse' : 'text-gold-400 glow-gold'}`}>
                {countdown}
                <span className="text-lg text-gold-200/40 ml-1">秒</span>
              </div>
            )}
          </div>

          {/* 評分制 — 快速評分模式 #8（scoring + custom 都走評分 UI） */}
          {(currentRound.type_id === 'scoring' || currentRound.type_id === 'custom') && (
            <div className="w-full max-w-lg mx-auto">
              {/* 進度 */}
              <div className="text-center mb-4">
                {tableScores[0]?.groupId ? (
                  <p className="text-gold-200/80 text-base font-bold mb-1">點選組別，為該組打分</p>
                ) : (
                  <p className="text-gold-200/80 text-base font-bold mb-1">點選桌號，為該桌打分</p>
                )}
                <span className="text-white/40 text-sm">
                  已評分：{tableScores.filter((ts) => ts.submitted).length} / {tableScores.length} {tableScores[0]?.groupId ? '組' : '桌'}
                </span>
              </div>

              {/* 桌號 / 組別 grid */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {tableScores.map((ts) => (
                  <button
                    key={ts.tableId}
                    onClick={() => {
                      if (ts.submitted) return
                      setScoringActiveTable(ts.tableId)
                      setPendingScore(Math.ceil(((currentRound.config?.scale_min ?? 1) + (currentRound.config?.scale_max ?? 10)) / 2))
                    }}
                    className={cn(
                      'min-h-[56px] py-3 rounded-xl text-center transition-all font-bold text-base border',
                      ts.submitted
                        ? 'bg-green-900/30 border-green-500/40 text-green-400 cursor-default'
                        : scoringActiveTable === ts.tableId
                          ? 'bg-gold-400/20 border-gold-400/60 text-gold-200'
                          : 'bg-surface-card border-white/10 text-white/80 active:scale-95',
                    )}
                  >
                    {ts.submitted ? (
                      <span className="flex flex-col items-center gap-1">
                        <span className="text-green-400 text-xl">✓</span>
                        <span className="text-xs text-green-300/70">{ts.score} 分</span>
                      </span>
                    ) : (
                      <span className="flex flex-col items-center gap-0.5">
                        {ts.groupName ? (
                          <span>{ts.groupName} 組</span>
                        ) : (
                          <span>第 {ts.tableNumber} 桌</span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* 彈出評分區塊 */}
              {scoringPanel}
            </div>
          )}

          {/* 猜謎制 */}
          {currentRound.type_id === 'quiz' && (
            <QuizOptions
              question={currentRound.config?.question ?? '猜猜這是哪一桌？'}
              options={tables.map((t) => ({
                id: t.id,
                label: t.name ?? `第 ${t.number} 桌`,
                disabled: t.number === participant?.table_number,
              }))}
              onSubmit={(selectedId) => handleVote(selectedId, undefined, selectedId)}
              autoSubmit
            />
          )}

          {/* 歡呼制 */}
          {currentRound.type_id === 'cheer' && (
            <div className="text-center py-8 px-6">
              <h2 className="text-2xl font-bold text-gold-200 mb-3">
                為你支持的桌號歡呼
              </h2>
              <p className="text-white/50 text-base">
                主持人將根據現場歡呼聲判定分數
                <br />
                <span className="text-gold-400">大聲為你支持的桌號喝采吧！</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Submitted Phase ─────────────────────────────────── */}
      {phase === 'submitted' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-400/50 flex items-center justify-center mb-5">
            <span className="text-green-400 text-2xl font-bold">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gold-200 mb-2">評分已送出</h2>
          <p className="text-white/50 text-base mb-4">
            等待其他人完成評分，主持人將手動揭曉結果
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
            結果揭曉時請抬頭看大螢幕
          </p>
          <button
            onClick={() => { syncNow(); showToast('已手動同步') }}
            className="mt-3 px-5 py-2 rounded-xl text-xs text-white/30 bg-white/5 border border-white/10 active:bg-white/10"
          >
            畫面未更新？點此手動同步
          </button>
        </div>
      )}

      {/* ─── Result Phase ────────────────────────────────────── */}
      {phase === 'result' && (
        <div className="min-h-screen flex flex-col px-4 pt-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gold-200 mb-1">本輪排行榜</h2>
            <p className="text-white/40 text-sm">下一輪開始時畫面將自動切換</p>
            <button
              onClick={() => { syncNow(); fetchLeaderboard(); showToast('已手動同步') }}
              className="inline-block mt-3 px-5 py-2 rounded-xl text-xs text-white/30 bg-white/5 border border-white/10 active:bg-white/10"
            >
              畫面未更新？點此手動同步
            </button>
          </div>

          {/* #10: 手機上顯示精簡排行榜 */}
          {leaderboard.length > 0 ? (
            <div className="w-full max-w-lg mx-auto space-y-2">
              {leaderboard.map((entry, idx) => {
                const rank = idx + 1
                const isMyGroup = participant && (
                  entry.entity_id === participant.table_id ||
                  groups.find(g => g.id === entry.entity_id)?.table_ids?.includes(participant.table_id)
                )
                const rankEmoji = RANK_EMOJI[rank] ?? `#${rank}`
                return (
                  <div
                    key={entry.entity_id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl border',
                      isMyGroup
                        ? 'bg-gold-400/15 border-gold-400/50'
                        : rank <= 3
                          ? 'bg-white/8 border-white/15'
                          : 'bg-surface-card border-white/8',
                    )}
                  >
                    <span className="w-10 text-center text-2xl font-black flex-shrink-0">
                      {rankEmoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white/90 truncate">
                        {entry.entity_name}
                        {isMyGroup && (
                          <span className="ml-2 text-gold-400 text-xs">← {groups.length > 0 ? '我的組' : '我的桌'}</span>
                        )}
                      </div>
                      {(entry as unknown as { subtitle?: string }).subtitle && (
                        <div className="text-xs text-white/30">{(entry as unknown as { subtitle?: string }).subtitle}</div>
                      )}
                    </div>
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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/70 text-white/90 text-xs z-50 pointer-events-none whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

