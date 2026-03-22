'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ScoreSliderProps {
  min?: number
  max?: number
  onSubmit: (score: number) => void
  disabled?: boolean
}

export function ScoreSlider({
  min = 1,
  max = 10,
  onSubmit,
  disabled = false,
}: ScoreSliderProps) {
  const [score, setScore] = useState(Math.ceil((min + max) / 2))
  const [submitted, setSubmitted] = useState(false)

  const percentage = ((score - min) / (max - min)) * 100

  function handleSubmit() {
    if (disabled || submitted) return
    setSubmitted(true)
    onSubmit(score)
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <div className="text-6xl font-black text-gold-400 glow-gold mb-2">
          {score}
        </div>
        <div className="text-gold-200/60 text-sm">已送出評分</div>
      </motion.div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto px-4 py-6 space-y-8">
      {/* 目前分數顯示 */}
      <motion.div
        className="text-center"
        key={score}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <span className="text-7xl font-black text-gold-400 glow-gold tabular-nums">
          {score}
        </span>
        <span className="text-2xl text-gold-200/40 ml-2">/ {max}</span>
      </motion.div>

      {/* 滑桿 */}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-3 appearance-none rounded-full bg-surface-elevated cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-10
            [&::-webkit-slider-thumb]:h-10
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-gold-400
            [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(255,179,0,0.5)]
            [&::-webkit-slider-thumb]:cursor-pointer"
          style={{
            background: `linear-gradient(to right, #FFB300 0%, #FFD740 ${percentage}%, #262626 ${percentage}%)`,
          }}
        />
        {/* 刻度標記 */}
        <div className="flex justify-between mt-2 px-1">
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
            <span
              key={n}
              className={cn(
                'text-xs tabular-nums',
                n === score ? 'text-gold-400 font-bold' : 'text-white/20'
              )}
            >
              {n}
            </span>
          ))}
        </div>
      </div>

      {/* 送出按鈕 */}
      <motion.button
        onClick={handleSubmit}
        disabled={disabled}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'w-full py-4 rounded-xl text-lg font-bold transition-all',
          'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark',
          'shadow-[0_0_20px_rgba(255,179,0,0.3)]',
          'active:shadow-[0_0_30px_rgba(255,179,0,0.5)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        確認送出
      </motion.button>
    </div>
  )
}
