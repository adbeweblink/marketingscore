'use client'

import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  color: string
}

const GOLD_COLORS = [
  'rgba(255, 215, 0, ',
  'rgba(255, 179, 0, ',
  'rgba(255, 228, 128, ',
  'rgba(205, 133, 63, ',
]

export function ParticleBackground({ intensity = 'normal' }: { intensity?: 'low' | 'normal' | 'high' | 'celebration' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const count = {
      low: 30,
      normal: 60,
      high: 100,
      celebration: 200,
    }[intensity]

    let animationId: number
    let particles: Particle[] = []

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
    }

    function createParticle(): Particle {
      const isCelebration = intensity === 'celebration'
      return {
        x: Math.random() * canvas!.width,
        y: isCelebration
          ? canvas!.height + Math.random() * 100
          : Math.random() * canvas!.height,
        size: Math.random() * (isCelebration ? 4 : 2.5) + 0.5,
        speedX: (Math.random() - 0.5) * (isCelebration ? 3 : 0.5),
        speedY: isCelebration
          ? -(Math.random() * 4 + 2)
          : -(Math.random() * 0.5 + 0.1),
        opacity: Math.random() * 0.6 + 0.2,
        color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
      }
    }

    function init() {
      resize()
      particles = Array.from({ length: count }, createParticle)
    }

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

      particles.forEach((p) => {
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx!.fillStyle = p.color + p.opacity + ')'
        ctx!.fill()

        // 微弱光暈
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx!.fillStyle = p.color + (p.opacity * 0.1) + ')'
        ctx!.fill()

        p.x += p.speedX
        p.y += p.speedY
        p.opacity -= intensity === 'celebration' ? 0.003 : 0.001

        // 重生
        if (p.y < -10 || p.opacity <= 0) {
          Object.assign(p, createParticle())
        }
        if (p.x < -10) p.x = canvas!.width + 10
        if (p.x > canvas!.width + 10) p.x = -10
      })

      animationId = requestAnimationFrame(animate)
    }

    init()
    animate()
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [intensity])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden
    />
  )
}
