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

  return NextResponse.json({
    event,
    event_code: event.code,
    rounds: rounds ?? [],
    tables: tables ?? [],
    participant_count: participantCount ?? 0,
  })
}
