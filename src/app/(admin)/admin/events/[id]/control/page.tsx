'use client'

import { useState } from 'react'
import { use } from 'react'
import { motion } from 'framer-motion'
import {
  Play, Square, SkipForward, Eye, Trophy,
  Plus, Minus, Timer, Users, Monitor
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RoundStatus } from '@/types/database'

// TODO: 從 API 拉取真實資料
const MOCK_ROUNDS = [
  { id: '1', seq: 1, title: '蒙面歌手（女生組）', type_id: 'quiz' as const, status: 'pending' as RoundStatus },
  { id: '2', seq: 2, title: '蒙面歌手（男生組）', type_id: 'quiz' as const, status: 'pending' as RoundStatus },
  { id: '3', seq: 3, title: '團體自選曲', type_id: 'scoring' as const, status: 'pending' as RoundStatus },
  { id: '4', seq: 4, title: '男女合唱 PK', type_id: 'scoring' as const, status: 'pending' as RoundStatus },
  { id: '5', seq: 5, title: '飆高音挑戰', type_id: 'cheer' as const, status: 'pending' as RoundStatus },
  { id: '6', seq: 6, title: '最終統計', type_id: 'custom' as const, status: 'pending' as RoundStatus },
]

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

export default function HostControlPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [rounds, setRounds] = useState(MOCK_ROUNDS)
  const [activeRound, setActiveRound] = useState<string | null>(null)
  const [voteProgress, setVoteProgress] = useState({ voted: 0, total: 80 })

  const currentRound = rounds.find((r) => r.id === activeRound)

  async function handleAction(action: string, roundId?: string) {
    // TODO: 呼叫 API + 廣播 Realtime
    console.log(`[Control] ${action}`, roundId || activeRound)

    switch (action) {
      case 'start':
        if (roundId) {
          setActiveRound(roundId)
          setRounds((prev) =>
            prev.map((r) => (r.id === roundId ? { ...r, status: 'open' as RoundStatus } : r))
          )
          setVoteProgress({ voted: 0, total: 80 })
        }
        break
      case 'stop':
        setRounds((prev) =>
          prev.map((r) => (r.id === activeRound ? { ...r, status: 'closed' as RoundStatus } : r))
        )
        break
      case 'reveal':
        setRounds((prev) =>
          prev.map((r) => (r.id === activeRound ? { ...r, status: 'revealed' as RoundStatus } : r))
        )
        break
      case 'next': {
        const currentIndex = rounds.findIndex((r) => r.id === activeRound)
        if (currentIndex < rounds.length - 1) {
          const nextRound = rounds[currentIndex + 1]
          setActiveRound(nextRound.id)
          setRounds((prev) =>
            prev.map((r) => (r.id === nextRound.id ? { ...r, status: 'open' as RoundStatus } : r))
          )
          setVoteProgress({ voted: 0, total: 80 })
        }
        break
      }
    }
  }

  return (
    <div className="min-h-screen bg-surface-dark p-4 pb-32">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gold-200">主持人控制台</h1>
          <p className="text-xs text-white/30">活動 ID: {id}</p>
        </div>

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
                  <span className="flex items-center gap-1"><Users size={12} /> 投票進度</span>
                  <span>{voteProgress.voted} / {voteProgress.total}</span>
                </div>
                <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold-400 rounded-full transition-all"
                    style={{ width: `${(voteProgress.voted / voteProgress.total) * 100}%` }}
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
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                      bg-red-500/20 text-red-300 active:bg-red-500/30"
                  >
                    <Square size={16} /> 結束投票
                  </button>
                  <button
                    onClick={() => {/* TODO: 倒數 */}}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold
                      bg-white/5 text-white/60 active:bg-white/10"
                  >
                    <Timer size={16} /> 倒數 30s
                  </button>
                </>
              )}

              {currentRound.status === 'closed' && (
                <button
                  onClick={() => handleAction('reveal')}
                  className="col-span-2 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-lg
                    bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
                    shadow-[0_0_15px_rgba(255,179,0,0.3)]"
                >
                  <Eye size={20} /> 揭曉結果
                </button>
              )}

              {currentRound.status === 'revealed' && (
                <button
                  onClick={() => handleAction('next')}
                  className="col-span-2 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-lg
                    bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
                    shadow-[0_0_15px_rgba(255,179,0,0.3)]"
                >
                  <SkipForward size={20} /> 下一輪
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* 手動加減分 */}
        {currentRound?.type_id === 'cheer' && (
          <div className="mb-6 p-4 rounded-xl bg-surface-card border border-white/5">
            <h3 className="text-sm font-bold text-gold-200/60 mb-3">手動加減分</h3>
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-white/60">第 {i + 1} 桌</span>
                  <div className="flex items-center gap-2">
                    <button className="w-8 h-8 rounded-lg bg-red-500/20 text-red-300 flex items-center justify-center">
                      <Minus size={14} />
                    </button>
                    <span className="w-12 text-center font-bold text-gold-200 tabular-nums">0</span>
                    <button className="w-8 h-8 rounded-lg bg-green-500/20 text-green-300 flex items-center justify-center">
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
          <h3 className="text-sm font-bold text-white/30 mb-2">所有回合</h3>
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
              </div>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', STATUS_COLORS[round.status])}>
                {STATUS_LABELS[round.status]}
              </span>
              {round.status === 'pending' && (
                <button
                  onClick={() => handleAction('start', round.id)}
                  className="w-8 h-8 rounded-lg bg-green-500/20 text-green-300 flex items-center justify-center"
                >
                  <Play size={14} />
                </button>
              )}
            </motion.div>
          ))}
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
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm
                bg-gold-400/10 text-gold-200 active:bg-gold-400/20"
            >
              <Trophy size={16} /> 最終排名
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
