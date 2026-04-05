'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, GripVertical, ChevronLeft, Loader2, AlertCircle, Users, Wand2, X, Check } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

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

/** 預設分組顏色 */
const GROUP_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#F97316', '#06B6D4', '#EC4899']
const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

interface GroupDef {
  _key: string
  name: string
  color: string
  /** 桌次號碼（1-based）陣列 */
  tableNumbers: number[]
}

/** 根據桌數自動建議分組（每 2 桌一組） */
function suggestGroups(tableCount: number): GroupDef[] {
  if (tableCount < 2) return []
  const groupSize = 2
  const groupCount = Math.ceil(tableCount / groupSize)
  return Array.from({ length: groupCount }, (_, i) => {
    const start = i * groupSize + 1
    const end = Math.min(start + groupSize - 1, tableCount)
    const tableNumbers = Array.from({ length: end - start + 1 }, (_, j) => start + j)
    return {
      _key: `g${i}`,
      name: GROUP_LABELS[i] ?? `第${i + 1}組`,
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      tableNumbers,
    }
  })
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

  // Admin key：URL > localStorage > 預設值
  const urlKey = searchParams.get('key') ?? ''
  const [adminKey, setAdminKey] = useState('')
  useEffect(() => {
    if (urlKey) {
      setAdminKey(urlKey)
      localStorage.setItem('ms_admin_key', urlKey)
    } else {
      const stored = localStorage.getItem('ms_admin_key')
      setAdminKey(stored || '123456')
    }
  }, [urlKey])

  // 表單狀態
  const [eventName, setEventName] = useState('Adobe FY26 經銷商大會春酒')
  const [tableCount, setTableCount] = useState(8)
  const [rounds, setRounds] = useState<RoundDef[]>(ADOBE_TEMPLATE)

  // 分組狀態
  const [enableGroups, setEnableGroups] = useState(false)
  const [groups, setGroups] = useState<GroupDef[]>(() => suggestGroups(8))

  // 桌數變更時同步更新分組建議
  useEffect(() => {
    if (enableGroups) {
      setGroups(suggestGroups(tableCount))
    }
  }, [tableCount, enableGroups])

  // 提交狀態
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 建立成功後的分享資訊
  const [createdEvent, setCreatedEvent] = useState<{ id: string; code: string; name: string } | null>(null)

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

  // ─── 分組操作 ─────────────────────────────────────────────────

  function updateGroupName(key: string, name: string) {
    setGroups((prev) => prev.map((g) => (g._key === key ? { ...g, name } : g)))
  }

  function updateGroupColor(key: string, color: string) {
    setGroups((prev) => prev.map((g) => (g._key === key ? { ...g, color } : g)))
  }

  function removeGroup(key: string) {
    setGroups((prev) => prev.filter((g) => g._key !== key))
  }

  function addGroup() {
    const usedNumbers = new Set(groups.flatMap((g) => g.tableNumbers))
    const available = Array.from({ length: tableCount }, (_, i) => i + 1).filter((n) => !usedNumbers.has(n))
    const idx = groups.length
    setGroups((prev) => [
      ...prev,
      {
        _key: `g${Date.now()}`,
        name: GROUP_LABELS[idx % GROUP_LABELS.length] ?? `第${idx + 1}組`,
        color: GROUP_COLORS[idx % GROUP_COLORS.length],
        tableNumbers: available.slice(0, 2),
      },
    ])
  }

  /** 把某桌從分組中移除或加入 */
  function toggleTableInGroup(groupKey: string, tableNum: number) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g._key !== groupKey) return g
        const has = g.tableNumbers.includes(tableNum)
        return {
          ...g,
          tableNumbers: has
            ? g.tableNumbers.filter((n) => n !== tableNum)
            : [...g.tableNumbers, tableNum].sort((a, b) => a - b),
        }
      })
    )
  }

  // 取得已被分配到某桌的組名（用於 UI 提示）
  function getTableGroup(tableNum: number): GroupDef | undefined {
    return groups.find((g) => g.tableNumbers.includes(tableNum))
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
      setError('尚未設定管理密碼，請先從控制台登入')
      return
    }

    setSubmitting(true)
    try {
      const groupsPayload = enableGroups && groups.length > 0
        ? groups
            .filter((g) => g.tableNumbers.length > 0)
            .map((g) => ({
              name: g.name.trim() || g._key,
              color: g.color,
              table_numbers: g.tableNumbers,
            }))
        : undefined

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
          groups: groupsPayload,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '建立失敗')
        return
      }

      // 成功後顯示分享頁面
      if (data.event) {
        setCreatedEvent({
          id: data.event.id,
          code: data.event.code,
          name: eventName.trim(),
        })
      } else {
        router.push('/admin')
      }
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── 建立成功：分享頁面 ──────────────────────────
  // 複製按鈕狀態
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  if (createdEvent) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://marketingscore.netlify.app'
    const playUrl = `${origin}/play/${createdEvent.code}`
    const displayUrl = `${origin}/display/${createdEvent.code}`
    const controlUrl = `${origin}/admin/events/${createdEvent.id}/control`

    const copyToClipboard = async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(null), 2000)
      } catch { /* ignore */ }
    }

    return (
      <div className="min-h-screen bg-surface-dark p-6">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gold-200 mb-2">活動建立成功</h1>
          <p className="text-white/50 mb-8">{createdEvent.name}</p>

          {/* QR Code */}
          <div className="bg-white rounded-2xl p-4 inline-block mb-4">
            <QRCodeSVG value={playUrl} size={240} level="M" bgColor="#FFFFFF" fgColor="#1A0A00" />
          </div>
          <p className="text-gold-400 font-mono text-2xl font-bold tracking-widest mb-8">
            {createdEvent.code}
          </p>

          {/* 連結列表 */}
          <div className="space-y-3 text-left mb-8">
            {[
              { key: 'play', label: '參與者手機', url: playUrl, icon: '📱' },
              { key: 'display', label: '大螢幕投影', url: displayUrl, icon: '📺' },
              { key: 'control', label: '主持人控制台', url: controlUrl, icon: '🎮' },
            ].map(link => (
              <div key={link.key} className="flex items-center gap-3 p-3 rounded-xl bg-surface-card border border-white/5">
                <span className="text-lg">{link.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/80">{link.label}</div>
                  <div className="text-xs text-white/30 truncate font-mono">{link.url}</div>
                </div>
                <button
                  onClick={() => copyToClipboard(link.key, link.url)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    copiedKey === link.key
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gold-400/10 text-gold-200 active:bg-gold-400/20'
                  }`}
                >
                  {copiedKey === link.key ? '✓ 已複製' : '複製'}
                </button>
              </div>
            ))}
          </div>

          {/* 操作按鈕 */}
          <div className="flex gap-3">
            <a
              href="/admin"
              className="flex-1 py-3 rounded-xl font-medium text-center bg-white/5 text-white/50"
            >
              回到後台
            </a>
            <a
              href={controlUrl}
              className="flex-1 py-3 rounded-xl font-bold text-center bg-gradient-to-r from-gold-600 to-gold-400 text-surface-dark"
            >
              進入控制台
            </a>
          </div>
        </div>
      </div>
    )
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

          {/* ── 分組設定 ─────────────────────────────────────── */}
          <section className="p-5 rounded-2xl bg-surface-card border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-gold-400/60" />
                <h2 className="text-sm font-bold text-gold-200/60 uppercase tracking-wider">
                  分組設定（選填）
                </h2>
              </div>
              <label className="relative inline-flex items-center cursor-pointer gap-2">
                <span className="text-xs text-white/40">
                  {enableGroups ? '已啟用' : '停用'}
                </span>
                <button
                  type="button"
                  onClick={() => setEnableGroups((v) => !v)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    enableGroups ? 'bg-gold-500' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      enableGroups ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>

            <AnimatePresence>
              {enableGroups && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {/* 自動建議提示 */}
                  <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-gold-400/5 border border-gold-400/10">
                    <Wand2 size={14} className="text-gold-400/60 flex-shrink-0" />
                    <p className="text-xs text-white/40">
                      依 {tableCount} 桌自動建議 {groups.length} 組（每 2 桌一組），可手動調整名稱和桌次。
                    </p>
                    <button
                      type="button"
                      onClick={() => setGroups(suggestGroups(tableCount))}
                      className="ml-auto text-xs text-gold-400/60 hover:text-gold-400 transition-colors whitespace-nowrap underline"
                    >
                      重置
                    </button>
                  </div>

                  {/* 組別列表 */}
                  <div className="space-y-3 mb-3">
                    {groups.map((group) => (
                      <div
                        key={group._key}
                        className="p-3 rounded-xl border border-white/5 bg-surface-elevated"
                        style={{ borderLeftColor: group.color, borderLeftWidth: 3 }}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          {/* 顏色選擇 */}
                          <div className="relative">
                            <input
                              type="color"
                              value={group.color}
                              onChange={(e) => updateGroupColor(group._key, e.target.value)}
                              className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent p-0 opacity-0 absolute inset-0"
                            />
                            <div
                              className="w-7 h-7 rounded-full border border-white/20 cursor-pointer flex-shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                          </div>

                          {/* 組名 */}
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) => updateGroupName(group._key, e.target.value)}
                            maxLength={20}
                            placeholder="組名"
                            className="flex-1 px-3 py-1.5 rounded-lg bg-surface-dark border border-white/5
                              text-white/80 text-sm placeholder-white/20
                              focus:outline-none focus:border-gold-400/30 transition-colors"
                          />

                          {/* 刪除組 */}
                          <button
                            type="button"
                            onClick={() => removeGroup(group._key)}
                            disabled={groups.length <= 1}
                            className="w-7 h-7 rounded-lg flex items-center justify-center
                              text-white/20 hover:text-red-400 hover:bg-red-500/10
                              disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>

                        {/* 桌次選擇 */}
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from({ length: tableCount }, (_, i) => i + 1).map((num) => {
                            const inThisGroup = group.tableNumbers.includes(num)
                            const otherGroup = !inThisGroup ? getTableGroup(num) : undefined
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => toggleTableInGroup(group._key, num)}
                                title={otherGroup ? `已在 ${otherGroup.name} 組` : `第 ${num} 桌`}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                  inThisGroup
                                    ? 'text-surface-dark shadow-sm'
                                    : otherGroup
                                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                                }`}
                                style={inThisGroup ? { backgroundColor: group.color } : undefined}
                                disabled={!!otherGroup && !inThisGroup}
                              >
                                {num}
                              </button>
                            )
                          })}
                        </div>

                        {group.tableNumbers.length === 0 && (
                          <p className="text-xs text-red-400/60 mt-2">⚠ 此組尚未分配任何桌次</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 新增組按鈕 */}
                  <button
                    type="button"
                    onClick={addGroup}
                    disabled={groups.length >= 8}
                    className="w-full py-2.5 rounded-xl border border-dashed border-white/10
                      text-white/30 text-sm
                      hover:border-gold-400/30 hover:text-gold-400/60 hover:bg-gold-400/5
                      disabled:opacity-30 disabled:cursor-not-allowed
                      transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={13} />
                    新增組別（最多 8 組）
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
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

          {/* Admin key 未設定提示 */}
          {!adminKey && (
            <p className="text-center text-xs text-yellow-400/60">
              尚未設定管理密碼，請先從控制台登入一次
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
