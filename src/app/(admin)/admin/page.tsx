'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Plus, Play, Settings, BarChart3, Loader2, RefreshCw, Trash2 } from 'lucide-react'

interface EventItem {
  id: string
  code: string
  name: string
  status: 'draft' | 'active' | 'finished'
  created_at: string
  tables: { count: number }[]
  rounds: { count: number }[]
  participants: { count: number }[]
}

const STATUS_LABELS = {
  draft: { label: '草稿', color: 'text-white/40 bg-white/10' },
  active: { label: '進行中', color: 'text-green-300 bg-green-500/20' },
  finished: { label: '已結束', color: 'text-gold-200 bg-gold-400/20' },
}

const DEFAULT_ADMIN_KEY = '123456'

export default function AdminDashboard() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 把 admin key 存進 localStorage，讓子頁面（控制台、新增活動）不用重新輸入
  useEffect(() => {
    localStorage.setItem('ms_admin_key', DEFAULT_ADMIN_KEY)
  }, [])

  const loadEvents = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/events', {
        headers: { 'x-admin-key': DEFAULT_ADMIN_KEY },
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setEvents(data.events || [])
      }
    } catch {
      setError('無法連線伺服器')
    } finally {
      setLoading(false)
    }
  }

  const deleteEvent = async (eventId: string, eventName: string) => {
    if (!confirm(`確定刪除「${eventName}」？此操作無法還原。`)) return
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': DEFAULT_ADMIN_KEY },
      })
      if (res.ok) {
        setEvents(prev => prev.filter(e => e.id !== eventId))
      }
    } catch {
      // 靜默忽略
    }
  }

  useEffect(() => { loadEvents() }, [])

  return (
    <div className="min-h-screen bg-surface-dark p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gold-200">活動管理</h1>
            <p className="text-white/40 text-sm mt-1">建立新活動或管理現有場次</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadEvents}
              className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              title="重新整理"
            >
              <RefreshCw size={20} className="text-white/60" />
            </button>
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
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 mb-2">{error}</p>
            <button
              onClick={loadEvents}
              className="text-gold-400 underline text-sm"
            >
              重試
            </button>
          </div>
        )}

        {/* 活動列表 */}
        {!loading && !error && (
          <div className="space-y-4">
            {events.length === 0 && (
              <div className="text-center py-20">
                <p className="text-white/30 mb-2">尚無活動</p>
                <p className="text-white/20 text-sm mb-4">點右上角「建立活動」以開始</p>
                <Link
                  href="/admin/events/new"
                  className="text-gold-400 underline"
                >
                  建立第一個活動
                </Link>
              </div>
            )}

            {events.map((event, index) => {
              const status = STATUS_LABELS[event.status]
              const tableCount = event.tables?.[0]?.count ?? 0
              const roundCount = event.rounds?.[0]?.count ?? 0
              const participantCount = event.participants?.[0]?.count ?? 0

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
                        <span>{tableCount} 桌</span>
                        <span>·</span>
                        <span>{roundCount} 回合</span>
                        <span>·</span>
                        <span>{participantCount} 人</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="flex gap-2 flex-wrap">
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
                    <button
                      onClick={() => deleteEvent(event.id, event.name)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                        bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 size={14} />
                      刪除
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
