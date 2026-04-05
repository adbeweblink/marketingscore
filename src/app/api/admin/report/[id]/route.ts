import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { verifyAdminKey } from '@/lib/auth'

/**
 * GET /api/admin/report/[id]
 * 取得活動所有回合的成績快取
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const adminKey = url.searchParams.get('key') || request.headers.get('x-admin-key')

    if (!verifyAdminKey(adminKey)) {
      return NextResponse.json({ error: '權限不足' }, { status: 401 })
    }

    const supabase = createAdminSupabase()

    // 取得該活動所有回合的 ID
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('event_id', id)

    if (!rounds || rounds.length === 0) {
      return NextResponse.json({ results: [] })
    }

    const roundIds = rounds.map(r => r.id)

    // 取得所有成績快取
    const { data: results, error } = await supabase
      .from('results_cache')
      .select('*')
      .in('round_id', roundIds)
      .order('rank', { ascending: true })

    if (error) {
      return NextResponse.json({ error: '查詢成績失敗' }, { status: 500 })
    }

    return NextResponse.json({ results: results ?? [] })
  } catch (err) {
    console.error('[Report] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
