'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Table, Group } from '@/types/database'

interface TableSelectorProps {
  tables: Table[]
  groups?: Group[]
  eventName: string
  onJoin: (tableId: string, displayName: string) => void
  loading?: boolean
}

export function TableSelector({
  tables,
  groups = [],
  eventName,
  onJoin,
  loading = false,
}: TableSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const hasGroups = groups.length > 0
  const selectionLabel = hasGroups ? '選擇組別' : '選擇桌號'
  const selectionHint = hasGroups
    ? '請對照桌上的組別牌，點選你所屬的組別'
    : '請對照桌上的號碼牌，點選對應數字'

  const selectedDisplay = hasGroups
    ? groups.find(g => g.id === selectedId)?.name ?? ''
    : `第 ${tables.find(t => t.id === selectedId)?.number} 桌`

  function handleJoin() {
    if (!selectedId) return
    const finalName = displayName.trim() || '匿名賓客'

    if (hasGroups) {
      const group = groups.find(g => g.id === selectedId)
      const firstTableId = group?.table_ids?.[0]
      if (firstTableId) {
        const table = tables.find(t => t.id === firstTableId)
        if (table) {
          onJoin(table.id, finalName)
          return
        }
      }
      onJoin(selectedId, finalName)
    } else {
      onJoin(selectedId, finalName)
    }
  }

  function handleNext() {
    if (step === 1) setStep(2)
    else if (step === 2 && selectedId) setStep(3)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <h1 className="text-2xl font-bold text-gold-200 animate-shimmer mb-2">
          {eventName}
        </h1>
        <p className="text-white/40 text-sm">完成以下步驟即可參與評分</p>
      </motion.div>

      {/* 進度指示 */}
      <div className="flex items-center gap-1 mb-8">
        {[
          { num: 1, label: '輸入暱稱' },
          { num: 2, label: selectionLabel },
          { num: 3, label: '確認加入' },
        ].map((s, idx, arr) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                step >= s.num ? 'bg-gold-400 text-surface-dark' : 'bg-white/10 text-white/30'
              )}>
                {step > s.num ? '✓' : s.num}
              </div>
              <span className={cn(
                'text-xs transition-all',
                step >= s.num ? 'text-gold-300/60' : 'text-white/20'
              )}>{s.label}</span>
            </div>
            {idx < arr.length - 1 && (
              <div className={cn(
                'w-6 h-0.5 mb-4 transition-all shrink-0',
                step > s.num ? 'bg-gold-400' : 'bg-white/10'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm text-center">
          <h2 className="text-xl font-bold text-white mb-2">輸入你的暱稱</h2>
          <p className="text-white/40 text-sm mb-6">選填，不輸入將以「匿名賓客」顯示</p>
          <input
            type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例：Mark" maxLength={20} autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            className="w-full px-5 py-4 rounded-2xl bg-surface-card border-2 border-white/10
              text-white text-xl text-center placeholder-white/20
              focus:border-gold-400 focus:outline-none transition-colors"
          />
          <motion.button onClick={handleNext} whileTap={{ scale: 0.95 }}
            className={cn('w-full mt-6 py-4 rounded-2xl text-lg font-bold transition-all',
              'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark'
            )}>
            下一步 →
          </motion.button>
        </motion.div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm text-center">
          <h2 className="text-xl font-bold text-white mb-2">{selectionLabel}</h2>
          <p className="text-white/40 text-sm mb-6">{selectionHint}</p>

          {(hasGroups ? groups.length === 0 : tables.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-10 mb-6 text-white/40">
              <div className="w-6 h-6 border-2 border-white/20 border-t-gold-400 rounded-full animate-spin mb-3" />
              <p className="text-sm">載入中，請稍候...</p>
            </div>
          ) : hasGroups ? (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {groups.map((group) => (
                <motion.button key={group.id} whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedId(group.id)}
                  className={cn(
                    'min-h-[72px] py-4 rounded-2xl border-2 font-black text-2xl transition-all',
                    selectedId === group.id
                      ? 'border-gold-400 bg-gold-400/20 text-gold-200 shadow-[0_0_20px_rgba(255,179,0,0.3)] scale-105'
                      : 'border-white/10 bg-surface-card text-white/50 active:border-gold-400/50'
                  )}>
                  <div className="text-2xl font-black">{group.name}</div>
                  <div className="text-xs text-white/30 mt-1 font-normal">
                    桌 {tables.filter(t => group.table_ids?.includes(t.id)).map(t => t.number).sort((a, b) => a - b).join(', ')}
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
              {tables.map((table) => {
                // 找這桌屬於哪個組
                const belongsToGroup = groups.find(g => g.table_ids?.includes(table.id))
                return (
                <motion.button key={table.id} whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedId(table.id)}
                  className={cn(
                    'min-h-[56px] py-2 rounded-2xl border-2 font-black text-xl transition-all',
                    selectedId === table.id
                      ? 'border-gold-400 bg-gold-400/20 text-gold-200 shadow-[0_0_20px_rgba(255,179,0,0.3)] scale-105'
                      : 'border-white/10 bg-surface-card text-white/50 active:border-gold-400/50'
                  )}>
                  <div>{table.number}</div>
                  {belongsToGroup && (
                    <div className="text-[10px] text-white/30 font-normal mt-0.5">{belongsToGroup.name}</div>
                  )}
                </motion.button>
                )
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 min-h-[52px] py-3 rounded-2xl font-bold text-white/40 bg-white/5">← 上一步</button>
            <motion.button onClick={handleNext} disabled={!selectedId} whileTap={{ scale: 0.95 }}
              className={cn('flex-[2] min-h-[52px] py-3 rounded-2xl text-lg font-bold transition-all',
                selectedId ? 'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark' : 'bg-surface-elevated text-white/20'
              )}>
              下一步 →
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm text-center">
          <h2 className="text-xl font-bold text-white mb-2">確認加入資訊</h2>
          <p className="text-white/40 text-sm mb-6">確認無誤後點「確認加入」即可開始參與</p>
          <div className="p-6 rounded-2xl bg-surface-card border border-white/10 mb-6 space-y-4">
            <div>
              <div className="text-xs text-white/30 mb-1">暱稱</div>
              <div className="text-2xl font-bold text-gold-200">{displayName}</div>
            </div>
            <div className="h-px bg-white/10" />
            <div>
              <div className="text-xs text-white/30 mb-1">{hasGroups ? '組別' : '桌號'}</div>
              <div className="text-4xl font-black text-gold-400">{selectedDisplay}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="flex-1 min-h-[52px] py-3 rounded-2xl font-bold text-white/40 bg-white/5">← 修改</button>
            <motion.button onClick={handleJoin} disabled={loading} whileTap={{ scale: 0.95 }}
              className="flex-[2] min-h-[52px] py-3 rounded-2xl text-lg font-bold bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark shadow-[0_0_20px_rgba(255,179,0,0.3)]">
              {loading ? '加入中...' : '確認加入'}
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
