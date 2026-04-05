import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'

/** #23 fix: 明確結果型別 */
interface CacheResult {
  round_id: string
  target_type: 'table' | 'group'
  target_id: string
  total_score: number
  vote_count: number
  rank: number | null
  metadata: Record<string, unknown>
}

/** 取得排行榜結果（#16: 用 event_code 取代 event_id 降低 IDOR） */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const eventCode = searchParams.get('event_code')
  const roundId = searchParams.get('round_id')

  if (!eventCode && !roundId) {
    return NextResponse.json({ error: '需要 event_code 或 round_id' }, { status: 400 })
  }

  const supabase = createAdminSupabase()

  if (roundId) {
    const { data: results, error } = await supabase
      .from('results_cache')
      .select('*')
      .eq('round_id', roundId)
      .order('rank', { ascending: true })

    if (error) {
      return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
    }

    const enriched = await enrichResults(supabase, (results ?? []) as EnrichableResult[])
    return NextResponse.json({ results: enriched })
  }

  // 先用 event_code 查 event_id
  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('code', eventCode!.toUpperCase())
    .single()

  if (!event) {
    return NextResponse.json({ error: '活動不存在' }, { status: 404 })
  }

  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('event_id', event.id)

  if (!rounds || rounds.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const roundIds = rounds.map((r: { id: string }) => r.id)
  const { data: allResults } = await supabase
    .from('results_cache')
    .select('*')
    .in('round_id', roundIds)

  const totals = new Map<string, {
    target_type: string
    target_id: string
    total_score: number
    round_scores: Record<string, number>
  }>()

  for (const r of (allResults ?? []) as CacheResult[]) {
    const existing = totals.get(r.target_id)
    if (existing) {
      existing.total_score += r.total_score
      existing.round_scores[r.round_id] = r.total_score
    } else {
      totals.set(r.target_id, {
        target_type: r.target_type,
        target_id: r.target_id,
        total_score: r.total_score,
        round_scores: { [r.round_id]: r.total_score },
      })
    }
  }

  // 有分組時只回傳 group 結果，無分組時只回傳 table 結果
  const hasGroups = Array.from(totals.values()).some(r => r.target_type === 'group')
  const filtered = Array.from(totals.values())
    .filter(r => hasGroups ? r.target_type === 'group' : r.target_type === 'table')

  const sorted = filtered
    .sort((a, b) => b.total_score - a.total_score)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const enriched = await enrichResults(supabase, sorted)
  return NextResponse.json({ results: enriched, event_name: event.name })
}

interface TableInfo { id: string; number: number; name: string | null }
interface EnrichableResult { target_type: string; target_id: string; [key: string]: unknown }

async function enrichResults(supabase: ReturnType<typeof createAdminSupabase>, results: EnrichableResult[]) {
  const tableIds = results
    .filter((r) => r.target_type === 'table')
    .map((r) => r.target_id)

  const groupIds = results
    .filter((r) => r.target_type === 'group')
    .map((r) => r.target_id)

  // 查桌次
  const tableMap = new Map<string, TableInfo>()
  if (tableIds.length > 0) {
    const { data: tables } = await supabase
      .from('tables')
      .select('id, number, name')
      .in('id', tableIds)
    for (const t of (tables ?? []) as TableInfo[]) {
      tableMap.set(t.id, t)
    }
  }

  // 查組別
  const groupMap = new Map<string, { id: string; name: string; table_ids: string[] }>()
  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name, table_ids')
      .in('id', groupIds)
    for (const g of (groups ?? []) as Array<{ id: string; name: string; table_ids: string[] }>) {
      groupMap.set(g.id, g)
    }
  }

  return results.map((r) => {
    if (r.target_type === 'group') {
      const group = groupMap.get(r.target_id)
      return {
        ...r,
        entity_id: r.target_id,
        entity_type: r.target_type,
        entity_name: group?.name ?? '未知組別',
      }
    }
    const table = tableMap.get(r.target_id)
    return {
      ...r,
      entity_id: r.target_id,
      entity_type: r.target_type,
      entity_name: table?.name ?? `第 ${table?.number ?? '?'} 桌`,
      entity_number: table?.number,
    }
  })
}
