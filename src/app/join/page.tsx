'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  function handleJoin() {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length >= 4) {
      router.push(`/play/${trimmed}`)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="text-5xl mb-4">🎤</div>
        <h1 className="text-2xl font-bold text-gold-200">加入活動</h1>
        <p className="text-white/40 text-sm mt-1">輸入活動代碼或掃描桌上的 QR Code</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm space-y-4"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="輸入活動代碼（如 ADO326）"
          maxLength={10}
          className="w-full px-6 py-4 rounded-xl bg-surface-card border-2 border-white/10
            text-center text-2xl font-bold tracking-[0.3em] text-gold-200
            placeholder-white/20 focus:border-gold-400 focus:outline-none
            transition-colors uppercase"
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        />

        <motion.button
          onClick={handleJoin}
          disabled={code.trim().length < 4}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'w-full py-4 rounded-xl text-lg font-bold transition-all',
            code.trim().length >= 4
              ? 'bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark shadow-[0_0_20px_rgba(255,179,0,0.3)]'
              : 'bg-surface-elevated text-white/30 cursor-not-allowed'
          )}
        >
          加入 🚀
        </motion.button>
      </motion.div>
    </div>
  )
}
