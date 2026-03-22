import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { generateEventCode } from '@/lib/utils'

/** 取得活動列表 */
export async function GET() {
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

/** 建立新活動 */
export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key')
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: '權限不足' }, { status: 401 })
    }

    const body = await request.json()
    const { name, table_count, rounds: roundDefs } = body as {
      name: string
      table_count: number
      rounds?: Array<{ title: string; type_id: string; config?: Record<string, unknown> }>
    }

    if (!name || !table_count) {
      return NextResponse.json({ error: '活動名稱和桌數為必填' }, { status: 400 })
    }

    const supabase = createAdminSupabase()
    const code = generateEventCode()

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
