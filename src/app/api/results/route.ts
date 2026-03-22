import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'

/** 取得排行榜結果 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get('event_id')
  const roundId = searchParams.get('round_id')

  if (!eventId && !roundId) {
    return NextResponse.json({ error: '需要 event_id 或 round_id' }, { status: 400 })
  }

  const supabase = createAdminSupabase()

  if (roundId) {
    // 取得單一回合結果
    const { data: results, error } = await supabase
      .from('results_cache')
      .select('*')
      .eq('round_id', roundId)
      .order('rank', { ascending: true })

    if (error) {
      return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
    }

    // 附加桌名
    const enriched = await enrichResults(supabase, results ?? [])
    return NextResponse.json({ results: enriched })
  }

  // 取得活動總積分（所有回合加總）
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('event_id', eventId!)

  if (!rounds || rounds.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const roundIds = rounds.map((r: { id: string }) => r.id)
  const { data: allResults } = await supabase
    .from('results_cache')
    .select('*')
    .in('round_id', roundIds)

  // 按 target_id 加總
  const totals = new Map<string, {
    target_type: string
    target_id: string
    total_score: number
    round_scores: Record<string, number>
  }>()

  for (const r of allResults ?? []) {
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

  const sorted = Array.from(totals.values())
    .sort((a, b) => b.total_score - a.total_score)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const enriched = await enrichResults(supabase, sorted)
  return NextResponse.json({ results: enriched })
}

async function enrichResults(supabase: ReturnType<typeof createAdminSupabase>, results: Array<Record<string, unknown>>) {
  const tableIds = results
    .filter((r) => r.target_type === 'table')
    .map((r) => r.target_id as string)

  if (tableIds.length === 0) return results

  const { data: tables } = await supabase
    .from('tables')
    .select('id, number, name')
    .in('id', tableIds)

  interface TableInfo { id: string; number: number; name: string | null }
  const tableMap = new Map<string, TableInfo>()
  for (const t of (tables ?? []) as TableInfo[]) {
    tableMap.set(t.id, t)
  }

  return results.map((r) => {
    const table = tableMap.get(r.target_id as string)
    return {
      ...r,
      entity_name: table?.name ?? `第 ${table?.number ?? '?'} 桌`,
      entity_number: table?.number,
    }
  })
}
