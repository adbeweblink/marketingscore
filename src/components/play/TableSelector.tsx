'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Table } from '@/types/database'

interface TableSelectorProps {
  tables: Table[]
  eventName: string
  onJoin: (tableId: string, displayName: string) => void
  loading?: boolean
}

export function TableSelector({
  tables,
  eventName,
  onJoin,
  loading = false,
}: TableSelectorProps) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  function handleNext() {
    if (step === 1 && displayName.trim()) setStep(2)
    else if (step === 2 && selectedTable) setStep(3)
  }

  function handleJoin() {
    if (!selectedTable || !displayName.trim()) return
    onJoin(selectedTable, displayName.trim())
  }

  const selectedTableNumber = tables.find(t => t.id === selectedTable)?.number

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-8">
      {/* 活動名稱 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <div className="text-6xl mb-4">🎤</div>
        <h1 className="text-2xl font-bold text-gold-200 animate-shimmer mb-2">
          {eventName}
        </h1>
        <p className="text-white/40 text-sm">只要 2 步就能加入！</p>
      </motion.div>

      {/* 進度指示 */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all',
              step >= s
                ? 'bg-gold-400 text-surface-dark'
                : 'bg-white/10 text-white/30'
            )}>
              {step > s ? '✓' : s}
            </div>
            {s < 2 && (
              <div className={cn(
                'w-8 h-0.5 transition-all',
                step > s ? 'bg-gold-400' : 'bg-white/10'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1：暱稱 */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <h2 className="text-xl font-bold text-white mb-2">你叫什麼名字？</h2>
          <p className="text-white/40 text-sm mb-6">輸入暱稱，讓大家知道你是誰</p>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例：Mark"
            maxLength={20}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            className="w-full px-5 py-4 rounded-2xl bg-surface-card border-2 border-white/10
              text-white text-xl text-center placeholder-white/20
              focus:border-gold-400 focus:outline-none transition-colors"
          />
          <motion.button
            onClick={handleNext}
            disabled={!displayName.trim()}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'w-full mt-6 py-4 rounded-2xl text-lg font-bold transition-all',
              displayName.trim()
                ? 'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark'
                : 'bg-surface-elevated text-white/20'
            )}
          >
            下一步 →
          </motion.button>
        </motion.div>
      )}

      {/* Step 2：選桌號 */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <h2 className="text-xl font-bold text-white mb-2">你坐第幾桌？</h2>
          <p className="text-white/40 text-sm mb-6">看桌上的號碼牌，點對應的數字</p>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {tables.map((table) => (
              <motion.button
                key={table.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSelectedTable(table.id)}
                className={cn(
                  'py-5 rounded-2xl border-2 font-black text-2xl transition-all',
                  selectedTable === table.id
                    ? 'border-gold-400 bg-gold-400/20 text-gold-200 shadow-[0_0_20px_rgba(255,179,0,0.3)] scale-105'
                    : 'border-white/10 bg-surface-card text-white/50 active:border-gold-400/50'
                )}
              >
                {table.number}
              </motion.button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-4 rounded-2xl font-bold text-white/40 bg-white/5"
            >
              ← 上一步
            </button>
            <motion.button
              onClick={handleNext}
              disabled={!selectedTable}
              whileTap={{ scale: 0.95 }}
              className={cn(
                'flex-[2] py-4 rounded-2xl text-lg font-bold transition-all',
                selectedTable
                  ? 'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark'
                  : 'bg-surface-elevated text-white/20'
              )}
            >
              下一步 →
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Step 3：確認 */}
      {step === 3 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm text-center"
        >
          <h2 className="text-xl font-bold text-white mb-6">確認資料</h2>
          <div className="p-6 rounded-2xl bg-surface-card border border-white/10 mb-6 space-y-4">
            <div>
              <div className="text-xs text-white/30 mb-1">暱稱</div>
              <div className="text-2xl font-bold text-gold-200">{displayName}</div>
            </div>
            <div className="h-px bg-white/10" />
            <div>
              <div className="text-xs text-white/30 mb-1">桌號</div>
              <div className="text-4xl font-black text-gold-400">第 {selectedTableNumber} 桌</div>
            </div>
          </div>
          <p className="text-white/30 text-xs mb-4">
            加入後就可以參與投票評分了！
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-4 rounded-2xl font-bold text-white/40 bg-white/5"
            >
              ← 修改
            </button>
            <motion.button
              onClick={handleJoin}
              disabled={loading}
              whileTap={{ scale: 0.95 }}
              className="flex-[2] py-4 rounded-2xl text-lg font-bold
                bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
                shadow-[0_0_20px_rgba(255,179,0,0.3)]"
            >
              {loading ? '加入中...' : '確認加入 🎉'}
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
