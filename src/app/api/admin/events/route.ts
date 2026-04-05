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
  groups: z.array(z.object({
    name: z.string().min(1).max(20),
    color: z.string().max(20).optional(),
    /** 桌次號碼（1-based），API 內部會轉換成 table UUID */
    table_numbers: z.array(z.number().int().min(1).max(50)),
  })).max(8).optional(),
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

    const { name, table_count, rounds: roundDefs, groups: groupDefs } = parsed.data

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

    // 2. 建立桌次（select 回 id 以供後續分組使用）
    const tableRows = Array.from({ length: table_count }, (_, i) => ({
      event_id: event.id,
      number: i + 1,
    }))
    const { data: tables } = await supabase
      .from('tables')
      .insert(tableRows)
      .select('id, number')

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

    // 4. 建立分組（如果有提供）
    if (groupDefs && groupDefs.length > 0 && tables) {
      // 建立桌次號碼 → UUID 的對照表
      const tableNumberMap = new Map<number, string>(
        (tables as { id: string; number: number }[]).map((t) => [t.number, t.id])
      )

      for (const g of groupDefs) {
        const tableIds = g.table_numbers
          .map((num) => tableNumberMap.get(num))
          .filter((id): id is string => !!id)

        if (tableIds.length === 0) continue

        // 4a. 新增 groups 記錄（含 table_ids JSON 欄位）
        const { data: createdGroup } = await supabase
          .from('groups')
          .insert({
            event_id: event.id,
            name: g.name,
            color: g.color ?? '#F59E0B',
            table_ids: tableIds,
          })
          .select('id')
          .single()

        // 4b. 寫入 group_tables 關聯表
        if (createdGroup) {
          const groupTableRows = tableIds.map((tableId) => ({
            group_id: createdGroup.id,
            table_id: tableId,
          }))
          await supabase.from('group_tables').insert(groupTableRows)
        }
      }
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
