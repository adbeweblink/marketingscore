'use client'

import { useState, useEffect, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft, BarChart3, Trophy, Users, Loader2, AlertCircle, Download
} from 'lucide-react'
import Link from 'next/link'
import { formatScore } from '@/lib/utils'
import { RANK_EMOJI } from '@/lib/constants'
import type { Round, Table, ResultCache } from '@/types/database'

interface ReportData {
  event: { id: string; name: string; code: string; status: string }
  rounds: Round[]
  tables: Table[]
  participant_count: number
  results: ResultCache[]
}

function EventReportInner({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const searchParams = useSearchParams()
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

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        // 載入活動資料
        const eventRes = await fetch(`/api/admin/events/${id}?key=${adminKey}`)
        const eventData = await eventRes.json()
        if (eventData.error) { setError(eventData.error); return }

        // 載入所有回合的成績
        const resultsRes = await fetch(`/api/admin/report/${id}?key=${adminKey}`)
        const resultsData = await resultsRes.json()

        setData({
          event: eventData.event,
          rounds: eventData.rounds || [],
          tables: eventData.tables || [],
          participant_count: eventData.participant_count || 0,
          results: resultsData.results || [],
        })
      } catch {
        setError('無法載入報告')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, adminKey])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white/60">{error || '無法載入'}</p>
          <Link href="/admin" className="text-gold-400 underline mt-4 inline-block">
            返回管理
          </Link>
        </div>
      </div>
    )
  }

  const { event, rounds, tables, participant_count, results } = data

  // 計算各桌各回合分數
  const tableScores = tables.map(table => {
    const roundScores: Record<string, { score: number; rank: number | null; voteCount: number }> = {}
    let totalScore = 0

    rounds.forEach(round => {
      const result = results.find(
        r => r.round_id === round.id && r.target_id === table.id
      )
      if (result) {
        roundScores[round.id] = {
          score: result.total_score,
          rank: result.rank,
          voteCount: result.vote_count,
        }
        totalScore += result.total_score
      }
    })

    return { table, roundScores, totalScore }
  }).sort((a, b) => b.totalScore - a.totalScore)

  const completedRounds = rounds.filter(r => r.status === 'revealed')

  return (
    <div className="min-h-screen bg-surface-dark p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={20} className="text-white/60" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gold-200 flex items-center gap-2">
                <BarChart3 size={24} />
                活動報告
              </h1>
              <p className="text-white/40 text-sm mt-1">{event.name}</p>
            </div>
          </div>
        </div>

        {/* 摘要 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          {[
            { label: '參與人數', value: participant_count, icon: Users },
            { label: '桌數', value: tables.length, icon: BarChart3 },
            { label: '已完成回合', value: `${completedRounds.length}/${rounds.length}`, icon: Trophy },
            { label: '總投票數', value: results.reduce((s, r) => s + r.vote_count, 0), icon: BarChart3 },
          ].map((item, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-surface-card border border-white/5 text-center"
            >
              <item.icon className="w-5 h-5 text-gold-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gold-200">{item.value}</div>
              <div className="text-xs text-white/40 mt-1">{item.label}</div>
            </div>
          ))}
        </motion.div>

        {/* 總排名 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-xl bg-surface-card border border-white/5 mb-6"
        >
          <h2 className="text-lg font-bold text-gold-200 flex items-center gap-2 mb-4">
            <Trophy size={18} />
            總排名
          </h2>
          {tableScores.length > 0 ? (
            <div className="space-y-2">
              {tableScores.map((item, rank) => (
                <div
                  key={item.table.id}
                  className={`flex items-center gap-4 p-4 rounded-lg ${
                    rank === 0 ? 'bg-gold-400/10 border border-gold-400/20' : 'bg-white/5'
                  }`}
                >
                  <span className="text-2xl w-10 text-center">
                    {RANK_EMOJI[rank + 1] || `${rank + 1}`}
                  </span>
                  <span className="text-white font-medium flex-1">
                    {item.table.name || `第 ${item.table.number} 桌`}
                  </span>
                  <span className="text-gold-400 font-bold text-xl">
                    {formatScore(item.totalScore)} 分
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/30 text-center py-4">尚無成績資料</p>
          )}
        </motion.div>

        {/* 各回合成績 */}
        {completedRounds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 rounded-xl bg-surface-card border border-white/5"
          >
            <h2 className="text-lg font-bold text-gold-200 mb-4">各回合成績</h2>

            {/* 表格 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-2 text-white/40 font-medium">桌次</th>
                    {completedRounds.map(r => (
                      <th key={r.id} className="text-center py-3 px-2 text-white/40 font-medium">
                        {r.title}
                      </th>
                    ))}
                    <th className="text-center py-3 px-2 text-gold-400 font-bold">總分</th>
                  </tr>
                </thead>
                <tbody>
                  {tableScores.map((item, i) => (
                    <tr
                      key={item.table.id}
                      className={`border-b border-white/5 ${
                        i === 0 ? 'bg-gold-400/5' : ''
                      }`}
                    >
                      <td className="py-3 px-2 text-white font-medium">
                        {item.table.name || `第 ${item.table.number} 桌`}
                      </td>
                      {completedRounds.map(r => {
                        const score = item.roundScores[r.id]
                        return (
                          <td key={r.id} className="text-center py-3 px-2 text-white/60">
                            {score ? formatScore(score.score) : '-'}
                          </td>
                        )
                      })}
                      <td className="text-center py-3 px-2 text-gold-200 font-bold">
                        {formatScore(item.totalScore)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default function EventReportPage({
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
      <EventReportInner params={params} />
    </Suspense>
  )
}
