import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'

/** 公開端點：查詢活動回合狀態（不需 admin key） */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    const supabase = createAdminSupabase()

    // 查活動
    const { data: event } = await supabase
      .from('events')
      .select('id, name, status')
      .eq('code', code.toUpperCase())
      .single()

    if (!event) {
      return NextResponse.json({ error: '活動不存在' }, { status: 404 })
    }

    // 查回合（只回傳公開資訊：id, seq, title, type_id, status）
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, seq, title, type_id, status, config')
      .eq('event_id', event.id)
      .order('seq')

    // 查桌次
    const { data: tables } = await supabase
      .from('tables')
      .select('id, number, name')
      .eq('event_id', event.id)
      .order('number')

    return NextResponse.json({
      event_id: event.id,
      event_name: event.name,
      event_status: event.status,
      rounds: rounds ?? [],
      tables: tables ?? [],
    })
  } catch (err) {
    console.error('[Status] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
