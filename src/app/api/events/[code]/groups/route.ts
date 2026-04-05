import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'

/** 公開端點：查詢活動的分組設定（不需 admin key，供大螢幕顯示使用） */
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
      .select('id')
      .eq('code', code.toUpperCase())
      .single()

    if (!event) {
      return NextResponse.json({ error: '活動不存在' }, { status: 404 })
    }

    // 查分組（只回傳公開資訊）
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name, color, table_ids')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })

    if (!groups || groups.length === 0) {
      return NextResponse.json({ groups: [] })
    }

    // 若 table_ids 欄位不存在或為 null（schema 版本較舊），
    // 從 group_tables 關聯表補回 table_ids
    const needsFallback = groups.some(
      (g) => !g.table_ids || (g.table_ids as string[]).length === 0
    )

    if (needsFallback) {
      const groupIds = groups.map((g) => g.id)
      const { data: groupTableRows } = await supabase
        .from('group_tables')
        .select('group_id, table_id')
        .in('group_id', groupIds)

      const tableIdsByGroup = new Map<string, string[]>()
      for (const row of groupTableRows ?? []) {
        const existing = tableIdsByGroup.get(row.group_id) ?? []
        existing.push(row.table_id)
        tableIdsByGroup.set(row.group_id, existing)
      }

      const enriched = groups.map((g) => ({
        ...g,
        table_ids:
          g.table_ids && (g.table_ids as string[]).length > 0
            ? g.table_ids
            : (tableIdsByGroup.get(g.id) ?? []),
      }))

      return NextResponse.json({ groups: enriched })
    }

    return NextResponse.json({ groups })
  } catch (err) {
    console.error('[Events/Groups] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
