import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { generateSecureEventCode, verifyAdminKey } from '@/lib/auth'
import { z } from 'zod/v4'

/** 取得活動列表（#2 fix: 加上 admin 認證） */
export async function GET(request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key')
  if (!verifyAdminKey(adminKey)) {
    return NextResponse.json({ error: '權限不足' }, { status: 401 })
  }

  const supabase = createAdminSupabase()

  const { data: events, error } = await supabase
    .from('events')
    .select(`
      *,
      tables(count),
      rounds(count),
      participants(count)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  return NextResponse.json({ events })
}

/** #7 fix: 建立活動 input 用 zod 嚴格驗證 */
const createEventSchema = z.object({
  name: z.string().min(1).max(100),
  table_count: z.number().int().min(1).max(50),
  rounds: z.array(z.object({
    title: z.string().min(1).max(100),
    type_id: z.enum(['scoring', 'quiz', 'cheer', 'custom']),
    config: z.record(z.string(), z.unknown()).optional(),
  })).max(20).optional(),
})

/** 建立新活動 */
export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key')
    if (!verifyAdminKey(adminKey)) {
      return NextResponse.json({ error: '權限不足' }, { status: 401 })
    }

    const body = await request.json()

    // #7 fix: zod 驗證 table_count 和 rounds
    const parsed = createEventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '輸入格式錯誤', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { name, table_count, rounds: roundDefs } = parsed.data

    const supabase = createAdminSupabase()
    const code = generateSecureEventCode() // #17 fix: crypto-safe random

    // 1. 建立活動
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        code,
        name,
        config: { table_count, theme: 'golden' },
      })
      .select()
      .single()

    if (eventError) {
      return NextResponse.json({ error: '建立活動失敗' }, { status: 500 })
    }

    // 2. 建立桌次
    const tables = Array.from({ length: table_count }, (_, i) => ({
      event_id: event.id,
      number: i + 1,
    }))
    await supabase.from('tables').insert(tables)

    // 3. 建立回合（如果有提供）
    if (roundDefs && roundDefs.length > 0) {
      const roundRows = roundDefs.map((r, i) => ({
        event_id: event.id,
        type_id: r.type_id,
        seq: i + 1,
        title: r.title,
        config: r.config ?? {},
      }))
      await supabase.from('rounds').insert(roundRows)
    }

    return NextResponse.json({
      success: true,
      event: { ...event, code },
    })
  } catch (err) {
    console.error('[Admin/Events] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
