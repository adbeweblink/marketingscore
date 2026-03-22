'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Plus, Play, Settings, BarChart3 } from 'lucide-react'

// TODO: 從 API 拉取真實資料
const MOCK_EVENTS = [
  {
    id: '1',
    code: 'ADO326',
    name: 'Adobe FY26 經銷商大會春酒',
    status: 'draft' as const,
    table_count: 8,
    round_count: 6,
    participant_count: 0,
    created_at: '2026-03-23',
  },
]

const STATUS_LABELS = {
  draft: { label: '草稿', color: 'text-white/40 bg-white/10' },
  active: { label: '進行中', color: 'text-green-300 bg-green-500/20' },
  finished: { label: '已結束', color: 'text-gold-200 bg-gold-400/20' },
}

export default function AdminDashboard() {
  const [events] = useState(MOCK_EVENTS)

  return (
    <div className="min-h-screen bg-surface-dark p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gold-200">活動管理</h1>
            <p className="text-white/40 text-sm mt-1">建立和管理你的活動評分</p>
          </div>
          <Link
            href="/admin/events/new"
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold
              bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
              shadow-[0_0_15px_rgba(255,179,0,0.2)]
              hover:shadow-[0_0_25px_rgba(255,179,0,0.4)]
              transition-shadow"
          >
            <Plus size={20} />
            建立活動
          </Link>
        </div>

        {/* 活動列表 */}
        <div className="space-y-4">
          {events.map((event, index) => {
            const status = STATUS_LABELS[event.status]

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-xl bg-surface-card border border-white/5
                  hover:border-gold-400/20 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gold-200">
                      {event.name}
                    </h2>
                    <div className="flex items-center gap-3 mt-2 text-sm text-white/40">
                      <span>代碼: <code className="text-gold-400">{event.code}</code></span>
                      <span>·</span>
                      <span>{event.table_count} 桌</span>
                      <span>·</span>
                      <span>{event.round_count} 回合</span>
                      <span>·</span>
                      <span>{event.participant_count} 人</span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/admin/events/${event.id}/control`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                      bg-gold-400/10 text-gold-200 hover:bg-gold-400/20 transition-colors"
                  >
                    <Play size={14} />
                    主持控制台
                  </Link>
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                      bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
                  >
                    <Settings size={14} />
                    設定
                  </Link>
                  <Link
                    href={`/admin/events/${event.id}/report`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                      bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
                  >
                    <BarChart3 size={14} />
                    報告
                  </Link>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
