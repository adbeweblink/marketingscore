'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface Ball {
  id: string
  name: string
  size: number
  x: number
  targetY: number
  floatDuration: number
  rotateSpeed: number
  rotateDirection: 1 | -1
}

const MAX_BALLS = 30

function truncateName(name: string): string {
  return name.length > 5 ? name.slice(0, 5) + '…' : name
}

/**
 * 投票金球效果
 * - 接收 completedVoters（全部評完分的用戶名字）
 * - 每人一顆金球，3D 旋轉浮動
 */
export function VoteBalls({ voters }: { voters: string[] }) {
  const [balls, setBalls] = useState<Ball[]>([])
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!voters || voters.length === 0) return

    const newNames = voters.filter((name) => !seenRef.current.has(name))
    if (newNames.length === 0) return

    for (const name of newNames) {
      seenRef.current.add(name)
    }

    const newBalls: Ball[] = newNames.map((name) => ({
      id: `${name}-${Date.now()}-${Math.random()}`,
      name,
      size: Math.floor(Math.random() * 36) + 45, // 45-80
      x: Math.floor(Math.random() * 84) + 8,     // 8-92 vw
      targetY: Math.floor(Math.random() * 55) + 10, // 10-65 vh
      floatDuration: Math.random() * 1.5 + 2.5,
      rotateSpeed: Math.random() * 4 + 4,         // 4-8s 一圈
      rotateDirection: Math.random() > 0.5 ? 1 : -1,
    }))

    setBalls((prev) => {
      const merged = [...prev, ...newBalls]
      return merged.length > MAX_BALLS ? merged.slice(merged.length - MAX_BALLS) : merged
    })
  }, [voters])

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 20, perspective: '800px' }}>
      <AnimatePresence>
        {balls.map((ball) => (
          <BallItem key={ball.id} ball={ball} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function BallItem({ ball }: { ball: Ball }) {
  const fontSize = Math.max(11, Math.floor(ball.size * 0.24))

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${ball.x}vw`,
        bottom: `-${ball.size}px`,
        width: ball.size,
        height: ball.size,
        translateX: '-50%',
        transformStyle: 'preserve-3d',
      }}
      initial={{ y: 0, scale: 0.2, opacity: 0 }}
      animate={{
        y: -(ball.targetY / 100) * (typeof window !== 'undefined' ? window.innerHeight : 800),
        scale: 1,
        opacity: 1,
      }}
      exit={{ opacity: 0, scale: 0.3, y: 50 }}
      transition={{
        type: 'spring',
        stiffness: 100,
        damping: 10,
        mass: 1,
      }}
    >
      {/* 浮動 */}
      <div
        style={{
          animation: `ball-float ${ball.floatDuration}s ease-in-out infinite`,
        }}
      >
        {/* 金球本體 — 3D 球體效果（光澤旋轉） */}
        <div
          className="ball-3d-sphere"
          style={{
            width: ball.size,
            height: ball.size,
            borderRadius: '50%',
            background: `
              radial-gradient(circle at 35% 30%, #ffe066 0%, #f5a623 35%, #d4880f 60%, #8B6914 85%, #5a4510 100%)
            `,
            boxShadow: `
              0 6px 25px rgba(255,166,0,0.6),
              0 2px 8px rgba(0,0,0,0.3),
              inset 0 -6px 12px rgba(0,0,0,0.3),
              inset 0 2px 6px rgba(255,255,200,0.4)
            `,
            position: 'relative',
            overflow: 'hidden',
            ['--ball-rotate-speed' as string]: `${ball.rotateSpeed}s`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              color: '#fff',
              fontWeight: 900,
              fontSize,
              textAlign: 'center',
              lineHeight: 1.1,
              padding: '0 4px',
              textShadow: '0 1px 3px rgba(0,0,0,0.7), 0 0 8px rgba(255,200,0,0.3)',
              wordBreak: 'break-all',
              maxWidth: ball.size - 10,
              letterSpacing: '-0.02em',
            }}
          >
            {truncateName(ball.name)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
