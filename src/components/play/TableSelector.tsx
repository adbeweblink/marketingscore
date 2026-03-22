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

  function handleJoin() {
    if (!selectedTable || !displayName.trim()) return
    onJoin(selectedTable, displayName.trim())
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      {/* 活動名稱 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="text-sm text-gold-200/50 mb-1">歡迎加入</div>
        <h1 className="text-2xl font-bold text-gold-200 animate-shimmer">
          {eventName}
        </h1>
      </motion.div>

      {/* 暱稱輸入 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm mb-6"
      >
        <label className="block text-sm text-gold-200/60 mb-2">你的名字</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="輸入你的暱稱"
          maxLength={20}
          className="w-full px-4 py-3 rounded-xl bg-surface-card border-2 border-white/10
            text-white placeholder-white/30 focus:border-gold-400 focus:outline-none
            transition-colors"
        />
      </motion.div>

      {/* 桌號選擇 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full max-w-sm mb-8"
      >
        <label className="block text-sm text-gold-200/60 mb-2">你的桌號</label>
        <div className="grid grid-cols-4 gap-2">
          {tables.map((table, index) => (
            <motion.button
              key={table.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + index * 0.05 }}
              onClick={() => setSelectedTable(table.id)}
              className={cn(
                'py-4 rounded-xl border-2 font-bold text-lg transition-all',
                selectedTable === table.id
                  ? 'border-gold-400 bg-gold-400/20 text-gold-200 shadow-[0_0_15px_rgba(255,179,0,0.3)]'
                  : 'border-white/10 bg-surface-card text-white/60 active:border-gold-400/50'
              )}
            >
              {table.number}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* 加入按鈕 */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        onClick={handleJoin}
        disabled={!selectedTable || !displayName.trim() || loading}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'w-full max-w-sm py-4 rounded-xl text-lg font-bold transition-all',
          selectedTable && displayName.trim()
            ? 'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark shadow-[0_0_20px_rgba(255,179,0,0.3)]'
            : 'bg-surface-elevated text-white/30 cursor-not-allowed'
        )}
      >
        {loading ? '加入中...' : '加入活動 🎤'}
      </motion.button>
    </div>
  )
}
