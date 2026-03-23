'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, GripVertical, ChevronLeft, Loader2, AlertCircle } from 'lucide-react'

// 遊戲類型選項
const ROUND_TYPES = [
  { value: 'scoring', label: '評分制', desc: '觀眾對表演桌評分 (1-10)' },
  { value: 'quiz', label: '猜謎制', desc: '猜哪一桌表演最佳' },
  { value: 'cheer', label: '歡呼制', desc: '現場歡呼聲決定勝負' },
  { value: 'custom', label: '自定義', desc: '其他特殊玩法' },
] as const

type RoundType = typeof ROUND_TYPES[number]['value']

interface RoundDef {
  /** 臨時 ID（前端排序用，不送後端） */
  _key: string
  title: string
  type_id: RoundType
}

/**
 * Adobe 大會 6 回合預設範本
 * 主持人可直接套用後微調
 */
const ADOBE_TEMPLATE: RoundDef[] = [
  { _key: 'k1', title: '蒙面歌手（女生組）', type_id: 'quiz' },
  { _key: 'k2', title: '蒙面歌手（男生組）', type_id: 'quiz' },
  { _key: 'k3', title: '團體自選曲', type_id: 'scoring' },
  { _key: 'k4', title: '男女合唱 PK', type_id: 'scoring' },
  { _key: 'k5', title: '飆高音挑戰', type_id: 'cheer' },
  { _key: 'k6', title: '最終統計', type_id: 'custom' },
]

function genKey() {
  return `k${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 內部元件：使用 useSearchParams，需包在 Suspense 內
 */
function NewEventForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const adminKey = searchParams.get('key') ?? ''

  // 表單狀態
  const [eventName, setEventName] = useState('Adobe FY26 經銷商大會春酒')
  const [tableCount, setTableCount] = useState(8)
  const [rounds, setRounds] = useState<RoundDef[]>(ADOBE_TEMPLATE)

  // 提交狀態
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 拖曳排序暫存
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // ─── 回合操作 ─────────────────────────────────────────────────

  function addRound() {
    setRounds((prev) => [
      ...prev,
      { _key: genKey(), title: '', type_id: 'scoring' },
    ])
  }

  function removeRound(key: string) {
    setRounds((prev) => prev.filter((r) => r._key !== key))
  }

  function updateRound(key: string, field: keyof Omit<RoundDef, '_key'>, value: string) {
    setRounds((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
    )
  }

  // 拖曳排序
  function handleDragStart(idx: number) {
    setDraggingIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function handleDrop(idx: number) {
    if (draggingIdx === null || draggingIdx === idx) return
    const newRounds = [...rounds]
    const [moved] = newRounds.splice(draggingIdx, 1)
    newRounds.splice(idx, 0, moved)
    setRounds(newRounds)
    setDraggingIdx(null)
    setDragOverIdx(null)
  }

  function handleDragEnd() {
    setDraggingIdx(null)
    setDragOverIdx(null)
  }

  // ─── 套用範本 ─────────────────────────────────────────────────
  function applyTemplate() {
    setRounds(ADOBE_TEMPLATE.map((r) => ({ ...r, _key: genKey() })))
  }

  // ─── 提交表單 ─────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // 基本驗證
    if (!eventName.trim()) {
      setError('請輸入活動名稱')
      return
    }
    if (tableCount < 1 || tableCount > 50) {
      setError('桌數須介於 1 到 50 之間')
      return
    }
    const emptyRound = rounds.find((r) => !r.title.trim())
    if (emptyRound) {
      setError('所有回合標題不得為空')
      return
    }
    if (!adminKey) {
      setError('缺少 admin key，請在 URL 加上 ?key=YOUR_KEY')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          name: eventName.trim(),
          table_count: tableCount,
          rounds: rounds.map((r) => ({
            title: r.title.trim(),
            type_id: r.type_id,
          })),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '建立失敗')
        return
      }

      // 成功後跳轉到主持人控制台
      const eventId = data.event?.id
      if (eventId) {
        router.push(`/admin/events/${eventId}/control?key=${encodeURIComponent(adminKey)}`)
      } else {
        router.push('/admin')
      }
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-dark">
      <div className="max-w-2xl mx-auto p-4 pb-32">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-surface-card border border-white/5
              flex items-center justify-center text-white/40 hover:text-white/60
              hover:bg-surface-elevated transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gold-200">建立新活動</h1>
            <p className="text-xs text-white/30 mt-0.5">設定活動資訊與回合流程</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── 活動基本資訊 ────────────────────────────────── */}
          <section className="p-5 rounded-2xl bg-surface-card border border-white/5">
            <h2 className="text-sm font-bold text-gold-200/60 mb-4 uppercase tracking-wider">
              基本資訊
            </h2>

            <div className="space-y-4">
              {/* 活動名稱 */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  活動名稱
                </label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="例：Adobe FY26 經銷商大會春酒"
                  maxLength={100}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-surface-elevated border border-white/10
                    text-white placeholder-white/20 text-sm
                    focus:outline-none focus:border-gold-400/50 focus:ring-1 focus:ring-gold-400/30
                    transition-colors"
                />
              </div>

              {/* 桌數 */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  桌數（1–50）
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={tableCount}
                    onChange={(e) => setTableCount(Number(e.target.value))}
                    min={1}
                    max={50}
                    required
                    className="w-28 px-4 py-3 rounded-xl bg-surface-elevated border border-white/10
                      text-white text-sm text-center
                      focus:outline-none focus:border-gold-400/50 focus:ring-1 focus:ring-gold-400/30
                      transition-colors"
                  />
                  <p className="text-xs text-white/30">
                    系統將自動建立對應的桌次代號
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── 回合設定 ─────────────────────────────────────── */}
          <section className="p-5 rounded-2xl bg-surface-card border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gold-200/60 uppercase tracking-wider">
                回合設定（{rounds.length} 個）
              </h2>
              <button
                type="button"
                onClick={applyTemplate}
                className="text-xs text-gold-400/60 hover:text-gold-400 transition-colors underline"
              >
                套用 Adobe 範本
              </button>
            </div>

            {/* 回合列表（可拖曳排序） */}
            <div className="space-y-2 mb-4">
              <AnimatePresence>
                {rounds.map((round, idx) => (
                  <motion.div
                    key={round._key}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.15 }}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    className={`p-3 rounded-xl border transition-colors cursor-grab active:cursor-grabbing
                      ${dragOverIdx === idx && draggingIdx !== idx
                        ? 'border-gold-400/50 bg-gold-400/5'
                        : 'border-white/5 bg-surface-elevated'
                      }
                      ${draggingIdx === idx ? 'opacity-40' : 'opacity-100'}
                    `}
                  >
                    <div className="flex items-start gap-2">
                      {/* 拖曳把手 + 序號 */}
                      <div className="flex items-center gap-1.5 mt-2.5 flex-shrink-0">
                        <GripVertical size={14} className="text-white/20" />
                        <span className="text-xs font-bold text-white/20 w-4 text-center">
                          {idx + 1}
                        </span>
                      </div>

                      {/* 回合內容 */}
                      <div className="flex-1 space-y-2">
                        {/* 標題 */}
                        <input
                          type="text"
                          value={round.title}
                          onChange={(e) => updateRound(round._key, 'title', e.target.value)}
                          placeholder={`回合 ${idx + 1} 標題`}
                          maxLength={100}
                          className="w-full px-3 py-2 rounded-lg bg-surface-dark border border-white/5
                            text-white/80 placeholder-white/20 text-sm
                            focus:outline-none focus:border-gold-400/30
                            transition-colors"
                        />

                        {/* 遊戲類型 */}
                        <select
                          value={round.type_id}
                          onChange={(e) => updateRound(round._key, 'type_id', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-surface-dark border border-white/5
                            text-white/70 text-sm
                            focus:outline-none focus:border-gold-400/30
                            transition-colors appearance-none"
                        >
                          {ROUND_TYPES.map((t) => (
                            <option key={t.value} value={t.value} className="bg-gray-900">
                              {t.label} — {t.desc}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 刪除按鈕 */}
                      <button
                        type="button"
                        onClick={() => removeRound(round._key)}
                        disabled={rounds.length <= 1}
                        className="mt-1.5 w-8 h-8 rounded-lg flex items-center justify-center
                          text-white/20 hover:text-red-400 hover:bg-red-500/10
                          disabled:opacity-20 disabled:cursor-not-allowed
                          transition-colors flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* 新增回合按鈕 */}
            <button
              type="button"
              onClick={addRound}
              disabled={rounds.length >= 20}
              className="w-full py-3 rounded-xl border border-dashed border-white/10
                text-white/30 text-sm
                hover:border-gold-400/30 hover:text-gold-400/60 hover:bg-gold-400/5
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={14} />
              新增回合（最多 20 個）
            </button>
          </section>

          {/* ── 錯誤提示 ─────────────────────────────────────── */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl
                bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
            >
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* ── 提交按鈕 ─────────────────────────────────────── */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl font-bold text-lg
              bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark
              shadow-[0_0_20px_rgba(255,179,0,0.2)]
              hover:shadow-[0_0_30px_rgba(255,179,0,0.35)]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-shadow flex items-center justify-center gap-3"
          >
            {submitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                建立中...
              </>
            ) : (
              '建立活動並進入控制台'
            )}
          </button>

          {/* Admin key 提示 */}
          {!adminKey && (
            <p className="text-center text-xs text-red-400/60">
              ⚠️ 請在 URL 加上 <code className="bg-white/5 px-1 rounded">?key=YOUR_ADMIN_KEY</code> 才能提交
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

/**
 * 頁面入口：包 Suspense boundary，讓 useSearchParams 在 SSR 時正確處理
 */
export default function NewEventPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-dark flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
        </div>
      }
    >
      <NewEventForm />
    </Suspense>
  )
}
