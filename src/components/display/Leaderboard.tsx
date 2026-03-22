'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { cn, formatScore } from '@/lib/utils'
import type { ScoreBoard } from '@/types/database'

interface LeaderboardProps {
  entries: ScoreBoard[]
  /** 是否顯示揭曉動畫 */
  revealing?: boolean
  /** 目前揭曉到第幾名（從最後一名開始） */
  revealIndex?: number
  /** 是否顯示分數 */
  showScores?: boolean
  className?: string
}

const RANK_STYLES: Record<number, string> = {
  1: 'bg-gradient-to-r from-yellow-600/40 to-yellow-500/20 border-yellow-400/60 text-yellow-200',
  2: 'bg-gradient-to-r from-slate-400/30 to-slate-300/10 border-slate-300/40 text-slate-200',
  3: 'bg-gradient-to-r from-amber-700/30 to-amber-600/10 border-amber-600/40 text-amber-200',
}

const RANK_EMOJI: Record<number, string> = {
  1: '👑',
  2: '🥈',
  3: '🥉',
}

export function Leaderboard({
  entries,
  revealing = false,
  revealIndex = entries.length,
  showScores = true,
  className,
}: LeaderboardProps) {
  const visibleEntries = revealing ? entries.slice(-revealIndex) : entries

  return (
    <div className={cn('w-full max-w-4xl mx-auto space-y-3', className)}>
      <AnimatePresence mode="popLayout">
        {visibleEntries.map((entry, index) => {
          const rank = entries.indexOf(entry) + 1
          const style = RANK_STYLES[rank] ?? 'bg-white/5 border-white/10 text-white/80'

          return (
            <motion.div
              key={entry.entity_id}
              layout
              initial={{ opacity: 0, x: 100, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -100, scale: 0.8 }}
              transition={{
                layout: { type: 'spring', stiffness: 200, damping: 25 },
                opacity: { duration: 0.4 },
                delay: revealing ? index * 0.3 : 0,
              }}
              className={cn(
                'flex items-center gap-4 px-6 py-4 rounded-xl border-2 backdrop-blur-sm',
                style
              )}
            >
              {/* 排名 */}
              <div className="flex-shrink-0 w-16 text-center">
                <span className="text-4xl font-black">
                  {RANK_EMOJI[rank] ?? `#${rank}`}
                </span>
              </div>

              {/* 桌號/組名 */}
              <div className="flex-1 min-w-0">
                <div className="text-2xl font-bold truncate">
                  {entry.entity_name}
                </div>
                {entry.entity_number && (
                  <div className="text-sm opacity-60">
                    第 {entry.entity_number} 桌
                  </div>
                )}
              </div>

              {/* 分數 */}
              {showScores && (
                <motion.div
                  className={cn(
                    'flex-shrink-0 text-right',
                    rank <= 3 && 'glow-gold'
                  )}
                  initial={revealing ? { opacity: 0 } : {}}
                  animate={{ opacity: 1 }}
                  transition={{ delay: revealing ? 0.5 : 0 }}
                >
                  <div className="text-5xl font-black tabular-nums">
                    {formatScore(entry.total_score)}
                  </div>
                  <div className="text-xs opacity-50 mt-1">分</div>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
