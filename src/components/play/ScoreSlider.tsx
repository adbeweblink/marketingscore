'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ScoreSliderProps {
  min?: number
  max?: number
  targetName?: string
  onSubmit: (score: number) => void
  disabled?: boolean
}

export function ScoreSlider({
  min = 1,
  max = 10,
  targetName,
  onSubmit,
  disabled = false,
}: ScoreSliderProps) {
  const [score, setScore] = useState(Math.ceil((min + max) / 2))
  const [submitted, setSubmitted] = useState(false)

  const percentage = ((score - min) / (max - min)) * 100

  // 分數描述
  const scoreLabel = score <= 3 ? '還好' : score <= 5 ? '不錯' : score <= 7 ? '很棒' : score <= 9 ? '超強' : '滿分！'

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
        className="text-center py-6"
      >
        <div className="text-5xl font-black text-gold-400 glow-gold mb-1">
          {score} 分
        </div>
        <div className="text-green-400 text-sm">✓ 已送出</div>
      </motion.div>
    )
  }

  return (
    <div className="w-full px-2 py-4 space-y-5">
      {/* 目前分數 + 描述 */}
      <div className="text-center">
        <motion.div
          key={score}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          <span className="text-6xl font-black text-gold-400 glow-gold tabular-nums">
            {score}
          </span>
        </motion.div>
        <div className="text-gold-200/50 text-sm mt-1">{scoreLabel}</div>
      </div>

      {/* 滑桿 */}
      <div>
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
            [&::-webkit-slider-thumb]:w-12
            [&::-webkit-slider-thumb]:h-12
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-gold-400
            [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(255,179,0,0.5)]
            [&::-webkit-slider-thumb]:cursor-pointer"
          style={{
            background: `linear-gradient(to right, #FFB300 0%, #FFD740 ${percentage}%, #262626 ${percentage}%)`,
          }}
        />
        <div className="flex justify-between mt-1 px-1">
          <span className="text-xs text-white/20">{min} 分</span>
          <span className="text-xs text-white/20">{max} 分</span>
        </div>
      </div>

      {/* 送出 */}
      <motion.button
        onClick={handleSubmit}
        disabled={disabled}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'w-full py-3.5 rounded-xl font-bold transition-all',
          'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark',
          'shadow-[0_0_15px_rgba(255,179,0,0.3)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        送出 {score} 分
      </motion.button>
    </div>
  )
}
