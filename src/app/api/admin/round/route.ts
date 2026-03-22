import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { verifyAdminKey } from '@/lib/auth'

/** #22 fix: 抽取 eventCode 取得邏輯 */
function extractEventCode(round: Record<string, unknown>): string | undefined {
  const events = round.events as { code: string } | undefined
  return events?.code
}

export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key')
    if (!verifyAdminKey(adminKey)) {
      return NextResponse.json({ error: '權限不足' }, { status: 401 })
    }

    const body = await request.json()
    const { action, round_id, event_id, data } = body as {
      action: string
      round_id?: string
      event_id?: string
      data?: Record<string, unknown>
    }

    const supabase = createAdminSupabase()

    switch (action) {
      case 'start': {
        if (!round_id) return NextResponse.json({ error: '缺少 round_id' }, { status: 400 })

        // #19 fix: 一次 JOIN 取回 events(code) + tables(id)
        const { data: round, error } = await supabase
          .from('rounds')
          .update({ status: 'open', opened_at: new Date().toISOString() })
          .eq('id', round_id)
          .select('*, events(code, tables(id))')
          .single()

        if (error) return NextResponse.json({ error: '更新失敗' }, { status: 500 })

        // 初始化 results_cache
        const eventData = round.events as { code: string; tables: Array<{ id: string }> } | undefined
        if (eventData?.tables) {
          const cacheEntries = eventData.tables.map((t: { id: string }) => ({
            round_id,
            target_type: 'table',
            target_id: t.id,
            total_score: 0,
            vote_count: 0,
          }))
          await supabase.from('results_cache').upsert(cacheEntries, {
            onConflict: 'round_id,target_type,target_id',
          })
        }

        return NextResponse.json({ success: true, round })
      }

      case 'stop': {
        if (!round_id) return NextResponse.json({ error: '缺少 round_id' }, { status: 400 })

        const { data: round, error } = await supabase
          .from('rounds')
          .update({ status: 'closed', closed_at: new Date().toISOString() })
          .eq('id', round_id)
          .select('*, events(code)')
          .single()

        if (error) return NextResponse.json({ error: '更新失敗' }, { status: 500 })

        // #3 fix: 用 RPC 一次完成排名計算，不再 N+1
        await supabase.rpc('finalize_round_ranks', { p_round_id: round_id })

        return NextResponse.json({ success: true, round })
      }

      case 'reveal': {
        if (!round_id) return NextResponse.json({ error: '缺少 round_id' }, { status: 400 })

        const { data: round, error } = await supabase
          .from('rounds')
          .update({ status: 'revealed' })
          .eq('id', round_id)
          .select('*, events(code)')
          .single()

        if (error) return NextResponse.json({ error: '更新失敗' }, { status: 500 })

        const { data: rankings } = await supabase
          .from('results_cache')
          .select('*')
          .eq('round_id', round_id)
          .order('rank', { ascending: true })

        return NextResponse.json({ success: true, rankings })
      }

      case 'manual_score': {
        // #6 fix: 加入邊界驗證
        const { table_id, score_delta } = data as { table_id: string; score_delta: number }
        if (!round_id || !table_id) {
          return NextResponse.json({ error: '缺少參數' }, { status: 400 })
        }
        if (typeof score_delta !== 'number' || !Number.isInteger(score_delta) || Math.abs(score_delta) > 100) {
          return NextResponse.json({ error: 'score_delta 超出允許範圍 (-100 ~ 100)' }, { status: 400 })
        }

        const { error: rpcError } = await supabase.rpc('increment_result_cache', {
          p_round_id: round_id,
          p_target_type: 'table',
          p_target_id: table_id,
          p_score: score_delta,
        })

        if (rpcError) {
          return NextResponse.json({ error: '更新分數失敗' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
      }

      case 'countdown': {
        // #6 fix: seconds 邊界限制 1-300
        const rawSeconds = (data as { seconds: number })?.seconds ?? 30
        const seconds = Math.max(1, Math.min(300, Math.floor(rawSeconds)))
        if (!event_id) return NextResponse.json({ error: '缺少 event_id' }, { status: 400 })

        return NextResponse.json({ success: true, countdown: seconds })
      }

      default:
        return NextResponse.json({ error: `未知的動作: ${action}` }, { status: 400 })
    }
  } catch (err) {
    console.error('[Admin/Round] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
