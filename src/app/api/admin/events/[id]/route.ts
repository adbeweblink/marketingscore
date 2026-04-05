import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { verifyAdminKey } from '@/lib/auth'

/**
 * GET /api/admin/events/[id]
 * 取得單一活動詳情（含回合列表、桌次資訊、參與人數）
 * 供主持人控制台頁面載入使用
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 從 URL query param 或 header 取得 admin key（前端用 ?key= 傳入）
  const { id } = await params
  const url = new URL(request.url)
  const keyFromQuery = url.searchParams.get('key')
  const keyFromHeader = request.headers.get('x-admin-key')
  const adminKey = keyFromHeader ?? keyFromQuery

  if (!verifyAdminKey(adminKey)) {
    return NextResponse.json({ error: '權限不足' }, { status: 401 })
  }

  const supabase = createAdminSupabase()

  // 查詢活動基本資訊
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return NextResponse.json({ error: '活動不存在' }, { status: 404 })
  }

  // 查詢回合列表（依序號排列）
  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('*')
    .eq('event_id', id)
    .order('seq', { ascending: true })

  if (roundsError) {
    return NextResponse.json({ error: '查詢回合失敗' }, { status: 500 })
  }

  // 查詢桌次資訊
  const { data: tables, error: tablesError } = await supabase
    .from('tables')
    .select('*')
    .eq('event_id', id)
    .order('number', { ascending: true })

  if (tablesError) {
    return NextResponse.json({ error: '查詢桌次失敗' }, { status: 500 })
  }

  // 查詢參與人數
  const { count: participantCount } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', id)

  // 查詢分組資訊（含 group_tables 關聯）
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, color, table_ids, created_at')
    .eq('event_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    event,
    event_code: event.code,
    rounds: rounds ?? [],
    tables: tables ?? [],
    groups: groups ?? [],
    participant_count: participantCount ?? 0,
  })
}

/**
 * DELETE /api/admin/events/[id]
 * 刪除活動（含所有相關資料：回合、桌次、參與者、投票、成績快取）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const adminKey = request.headers.get('x-admin-key')

    if (!verifyAdminKey(adminKey)) {
      return NextResponse.json({ error: '權限不足' }, { status: 401 })
    }

    const supabase = createAdminSupabase()

    // 先確認活動存在
    const { data: event } = await supabase
      .from('events')
      .select('id, name')
      .eq('id', id)
      .single()

    if (!event) {
      return NextResponse.json({ error: '活動不存在' }, { status: 404 })
    }

    // 依序刪除相關資料（外鍵依賴順序）
    // 1. 刪投票（依賴 rounds）
    const { data: rounds } = await supabase.from('rounds').select('id').eq('event_id', id)
    if (rounds && rounds.length > 0) {
      const roundIds = rounds.map(r => r.id)
      await supabase.from('votes').delete().in('round_id', roundIds)
      await supabase.from('results_cache').delete().in('round_id', roundIds)
    }
    // 2. 刪回合
    await supabase.from('rounds').delete().eq('event_id', id)
    // 3. 刪參與者
    await supabase.from('participants').delete().eq('event_id', id)
    // 4. 刪桌次
    await supabase.from('tables').delete().eq('event_id', id)
    // 5. 刪群組
    await supabase.from('groups').delete().eq('event_id', id)
    // 6. 刪活動本身
    const { error: deleteError } = await supabase.from('events').delete().eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: event.name })
  } catch (err) {
    console.error('[Admin/Events] Delete error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
