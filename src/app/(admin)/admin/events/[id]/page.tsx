'use client'

import { useState, useEffect, use, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Save, Trash2, Users, Hash, Loader2, AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import type { Event, Round, Table, Group } from '@/types/database'

const ROUND_TYPE_LABELS: Record<string, string> = {
  scoring: '評分制',
  quiz: '猜謎制',
  cheer: '應援制',
  custom: '自訂',
}

function EventSettingsInner({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlKey = searchParams.get('key') ?? ''
  const [adminKey, setAdminKey] = useState('123456')
  useEffect(() => {
    if (urlKey) {
      setAdminKey(urlKey)
      localStorage.setItem('ms_admin_key', urlKey)
    } else {
      const stored = localStorage.getItem('ms_admin_key')
      if (stored) setAdminKey(stored)
    }
  }, [urlKey])

  const [event, setEvent] = useState<Event | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/events/${id}?key=${adminKey}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setEvent(data.event)
          setRounds(data.rounds || [])
          setTables(data.tables || [])
          setGroups(data.groups || [])
          setParticipantCount(data.participant_count || 0)
        }
      })
      .catch(() => setError('無法載入活動'))
      .finally(() => setLoading(false))
  }, [id, adminKey])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white/60">{error || '活動不存在'}</p>
          <Link href="/admin" className="text-gold-400 underline mt-4 inline-block">
            返回管理
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-dark p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} className="text-white/60" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gold-200">活動設定</h1>
            <p className="text-white/40 text-sm mt-1">{event.name}</p>
          </div>
        </div>

        {/* 基本資訊 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-xl bg-surface-card border border-white/5 mb-6"
        >
          <h2 className="text-lg font-bold text-gold-200 mb-4">基本資訊</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/40 block mb-1">活動名稱</label>
              <p className="text-white font-medium">{event.name}</p>
            </div>
            <div>
              <label className="text-xs text-white/40 block mb-1">活動代碼</label>
              <p className="text-gold-400 font-mono font-bold">{event.code}</p>
            </div>
            <div>
              <label className="text-xs text-white/40 block mb-1">狀態</label>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                event.status === 'active' ? 'bg-green-500/20 text-green-300'
                : event.status === 'finished' ? 'bg-gold-400/20 text-gold-200'
                : 'bg-white/10 text-white/40'
              }`}>
                {event.status === 'active' ? '進行中' : event.status === 'finished' ? '已結束' : '草稿'}
              </span>
            </div>
            <div>
              <label className="text-xs text-white/40 block mb-1">建立時間</label>
              <p className="text-white/60 text-sm">
                {new Date(event.created_at).toLocaleString('zh-TW')}
              </p>
            </div>
          </div>
        </motion.div>

        {/* 桌次 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-xl bg-surface-card border border-white/5 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gold-200 flex items-center gap-2">
              <Users size={18} />
              桌次（{tables.length} 桌）
            </h2>
            <span className="text-sm text-white/40">
              {participantCount} 位參與者
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {tables.map(table => (
              <div
                key={table.id}
                className="p-3 rounded-lg bg-white/5 text-center"
              >
                <div className="text-gold-400 font-bold text-lg">
                  {table.number}
                </div>
                <div className="text-white/30 text-xs">
                  {table.name || `第 ${table.number} 桌`}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 分組資訊 */}
        {groups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-6 rounded-xl bg-surface-card border border-white/5 mb-6"
          >
            <h2 className="text-lg font-bold text-gold-200 flex items-center gap-2 mb-4">
              <Users size={18} />
              分組（{groups.length} 組）
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {groups.map((group) => {
                // 找出各組涵蓋的桌次號碼
                const groupTables = tables.filter((t) => group.table_ids.includes(t.id))
                return (
                  <div
                    key={group.id}
                    className="p-4 rounded-xl border-2 bg-white/5"
                    style={{ borderColor: group.color ?? '#F59E0B' }}
                  >
                    <div
                      className="text-lg font-bold mb-2"
                      style={{ color: group.color ?? '#F59E0B' }}
                    >
                      {group.name}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {groupTables.map((t) => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded-md text-xs font-bold text-surface-dark"
                          style={{ backgroundColor: group.color ?? '#F59E0B' }}
                        >
                          {t.number}桌
                        </span>
                      ))}
                    </div>
                    {groupTables.length === 0 && (
                      <p className="text-white/30 text-xs">（無桌次）</p>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* 回合 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-6 rounded-xl bg-surface-card border border-white/5"
        >
          <h2 className="text-lg font-bold text-gold-200 flex items-center gap-2 mb-4">
            <Hash size={18} />
            回合（{rounds.length} 個）
          </h2>
          <div className="space-y-3">
            {rounds.map((round, i) => (
              <div
                key={round.id}
                className="flex items-center gap-4 p-4 rounded-lg bg-white/5"
              >
                <span className="text-gold-400 font-bold text-lg w-8 text-center">
                  {round.seq}
                </span>
                <div className="flex-1">
                  <p className="text-white font-medium">{round.title}</p>
                  <p className="text-white/40 text-sm">
                    {ROUND_TYPE_LABELS[round.type_id] || round.type_id}
                    {round.config?.scale_min !== undefined && round.config?.scale_max !== undefined && (
                      <span className="ml-2">
                        （{round.config.scale_min}-{round.config.scale_max} 分）
                      </span>
                    )}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  round.status === 'open' ? 'bg-green-500/20 text-green-300'
                  : round.status === 'closed' ? 'bg-yellow-500/20 text-yellow-300'
                  : round.status === 'revealed' ? 'bg-gold-400/20 text-gold-200'
                  : 'bg-white/10 text-white/40'
                }`}>
                  {round.status === 'open' ? '投票中'
                    : round.status === 'closed' ? '已結束'
                    : round.status === 'revealed' ? '已揭曉'
                    : '待開始'}
                </span>
              </div>
            ))}
            {rounds.length === 0 && (
              <p className="text-white/30 text-center py-4">尚無回合</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default function EventSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-dark flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
        </div>
      }
    >
      <EventSettingsInner params={params} />
    </Suspense>
  )
}
