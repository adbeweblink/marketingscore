'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface QuizOption {
  id: string
  label: string
  disabled?: boolean
}

interface QuizOptionsProps {
  question: string
  options: QuizOption[]
  onSubmit: (selectedId: string) => void
  disabled?: boolean
  /** 選即送：選取後直接呼叫 onSubmit，不需按確認按鈕 */
  autoSubmit?: boolean
}

export function QuizOptions({
  question,
  options,
  onSubmit,
  disabled = false,
  autoSubmit = false,
}: QuizOptionsProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function handleSelect(id: string) {
    if (disabled || submitted || options.find(o => o.id === id)?.disabled) return
    setSelected(id)
    if (autoSubmit) {
      setSubmitted(true)
      onSubmit(id)
    }
  }

  function handleSubmit() {
    if (!selected || disabled || submitted) return
    setSubmitted(true)
    onSubmit(selected)
  }

  if (submitted) {
    const selectedOption = options.find((o) => o.id === selected)
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <div className="text-5xl mb-3">🎯</div>
        <div className="text-xl font-bold text-gold-400 mb-1">
          你選了 {selectedOption?.label}
        </div>
        <div className="text-green-400 text-sm">✓ 已送出，等待揭曉答案...</div>
      </motion.div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto px-4 py-6 space-y-6">
      {/* 題目 + 說明 */}
      <div className="text-center">
        <div className="text-3xl mb-3">🤔</div>
        <div className="text-xl font-bold text-white mb-2">
          {question}
        </div>
        <div className="text-white/40 text-sm">
          點選你覺得的答案，灰色的是你自己的桌（不能選）
        </div>
      </div>

      {/* 選項 */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((option, index) => (
          <motion.button
            key={option.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            whileTap={option.disabled ? {} : { scale: 0.93 }}
            onClick={() => handleSelect(option.id)}
            disabled={disabled || option.disabled || submitted}
            className={cn(
              'relative py-6 px-4 rounded-2xl border-2 text-center transition-all',
              'font-bold text-lg',
              option.disabled
                ? 'opacity-25 cursor-not-allowed border-white/5 bg-white/5 line-through'
                : selected === option.id
                  ? 'border-gold-400 bg-gold-400/20 text-gold-200 shadow-[0_0_20px_rgba(255,179,0,0.3)] scale-[1.03]'
                  : 'border-white/10 bg-surface-card text-white/70 active:border-gold-400/50'
            )}
          >
            {option.label}
            {option.disabled && (
              <span className="absolute -top-2 -right-2 text-xs bg-white/10 text-white/40 px-2 py-0.5 rounded-full">
                你的桌
              </span>
            )}
            {selected === option.id && (
              <span className="absolute -top-2 -right-2 text-xs bg-gold-400 text-surface-dark px-2 py-0.5 rounded-full font-bold">
                ✓
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* 送出（autoSubmit 模式下隱藏） */}
      {!autoSubmit && (
        <motion.button
          onClick={handleSubmit}
          disabled={!selected || disabled}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'w-full py-4 rounded-2xl text-lg font-bold transition-all',
            selected
              ? 'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark shadow-[0_0_20px_rgba(255,179,0,0.3)]'
              : 'bg-surface-elevated text-white/20'
          )}
        >
          {selected ? '確認送出 ✓' : '👆 先選一個答案'}
        </motion.button>
      )}
    </div>
  )
}
