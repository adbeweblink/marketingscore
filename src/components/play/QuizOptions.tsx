'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface QuizOption {
  id: string
  label: string
  disabled?: boolean // 自己的桌不能選
}

interface QuizOptionsProps {
  question: string
  options: QuizOption[]
  onSubmit: (selectedId: string) => void
  disabled?: boolean
}

export function QuizOptions({
  question,
  options,
  onSubmit,
  disabled = false,
}: QuizOptionsProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

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
        <div className="text-4xl mb-2">🎯</div>
        <div className="text-xl font-bold text-gold-400 mb-1">
          {selectedOption?.label}
        </div>
        <div className="text-gold-200/60 text-sm">已送出答案，等待揭曉...</div>
      </motion.div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto px-4 py-6 space-y-6">
      {/* 題目 */}
      <div className="text-center">
        <div className="text-xl font-bold text-gold-200 mb-1">
          {question}
        </div>
      </div>

      {/* 選項 */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((option, index) => (
          <motion.button
            key={option.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => !option.disabled && setSelected(option.id)}
            disabled={disabled || option.disabled}
            className={cn(
              'relative py-6 px-4 rounded-xl border-2 text-center transition-all',
              'font-bold text-lg',
              option.disabled
                ? 'opacity-30 cursor-not-allowed border-white/5 bg-white/5'
                : selected === option.id
                  ? 'border-gold-400 bg-gold-400/20 text-gold-200 shadow-[0_0_15px_rgba(255,179,0,0.3)]'
                  : 'border-white/10 bg-surface-card text-white/80 active:border-gold-400/50'
            )}
          >
            {option.label}
            {option.disabled && (
              <span className="absolute top-1 right-2 text-xs text-white/30">
                你的桌
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* 送出按鈕 */}
      <motion.button
        onClick={handleSubmit}
        disabled={!selected || disabled}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'w-full py-4 rounded-xl text-lg font-bold transition-all',
          selected
            ? 'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark shadow-[0_0_20px_rgba(255,179,0,0.3)]'
            : 'bg-surface-elevated text-white/30 cursor-not-allowed'
        )}
      >
        {selected ? '確認送出' : '請選擇答案'}
      </motion.button>
    </div>
  )
}
