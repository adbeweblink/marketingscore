'use client'

import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ScoreCounterProps {
  targetScore: number
  /** 動畫持續秒數 */
  duration?: number
  /** 是否啟動動畫 */
  animate?: boolean
  /** 緊張模式：越接近目標越慢 */
  suspense?: boolean
  className?: string
}

/**
 * 緊張分數累計元件
 * 數字從 0 慢慢跳到目標分數，越接近越慢，最後一刻定格
 */
export function ScoreCounter({
  targetScore,
  duration = 4,
  animate = true,
  suspense = true,
  className,
}: ScoreCounterProps) {
  const [displayScore, setDisplayScore] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!animate) {
      setDisplayScore(targetScore)
      setIsComplete(true)
      return
    }

    setIsComplete(false)
    const startTime = performance.now()
    const durationMs = duration * 1000

    function update(now: number) {
      const elapsed = now - startTime
      let progress = Math.min(elapsed / durationMs, 1)

      if (suspense) {
        // 緊張曲線：開始快 → 中段穩 → 尾段極慢 → 最後一刻跳到位
        // easeOutExpo 的加強版
        if (progress < 0.6) {
          progress = progress / 0.6 * 0.85 // 前 60% 時間跑完 85% 分數
        } else if (progress < 0.9) {
          progress = 0.85 + ((progress - 0.6) / 0.3) * 0.1 // 中 30% 跑 10%
        } else {
          progress = 0.95 + ((progress - 0.9) / 0.1) * 0.05 // 最後 10% 跑 5%
        }
      } else {
        // 普通 easeOut
        progress = 1 - Math.pow(1 - progress, 3)
      }

      const current = Math.round(targetScore * progress * 10) / 10
      setDisplayScore(current)

      if (elapsed < durationMs) {
        frameRef.current = requestAnimationFrame(update)
      } else {
        setDisplayScore(targetScore)
        setIsComplete(true)
      }
    }

    frameRef.current = requestAnimationFrame(update)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [targetScore, duration, animate, suspense])

  return (
    <motion.div
      className={cn('relative inline-block', className)}
      animate={isComplete ? { scale: [1, 1.2, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      <span
        className={cn(
          'font-bold tabular-nums glow-gold transition-all',
          isComplete && 'glow-gold-strong animate-score-pulse'
        )}
      >
        {displayScore % 1 === 0 ? displayScore.toFixed(0) : displayScore.toFixed(1)}
      </span>

      {/* 定格時的光爆效果 */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0.8, scale: 0.5 }}
          animate={{ opacity: 0, scale: 3 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 rounded-full bg-gold-400/30 blur-xl pointer-events-none"
        />
      )}
    </motion.div>
  )
}
