import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // TODO: 驗證 admin 權限（目前用 header）
    const adminKey = request.headers.get('x-admin-key')
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
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

        // 更新回合狀態為 open
        const { data: round, error } = await supabase
          .from('rounds')
          .update({ status: 'open', opened_at: new Date().toISOString() })
          .eq('id', round_id)
          .select('*, events(code)')
          .single()

        if (error) return NextResponse.json({ error: '更新失敗' }, { status: 500 })

        // 初始化 results_cache
        const eventTables = await supabase
          .from('tables')
          .select('id')
          .eq('event_id', round.event_id)

        if (eventTables.data) {
          const cacheEntries = eventTables.data.map((t: { id: string }) => ({
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

        // 廣播
        const eventCode = (round as Record<string, unknown> & { events: { code: string } }).events?.code
        if (eventCode) {
          await supabase.channel(`round:${eventCode}`).send({
            type: 'broadcast',
            event: 'status_change',
            payload: { round_id, status: 'open', round },
          })
          await supabase.channel(`control:${eventCode}`).send({
            type: 'broadcast',
            event: 'command',
            payload: { action: 'show_round_intro', round },
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

        // 計算最終排名
        const { data: results } = await supabase
          .from('results_cache')
          .select('*')
          .eq('round_id', round_id)
          .order('total_score', { ascending: false })

        if (results) {
          for (let i = 0; i < results.length; i++) {
            await supabase
              .from('results_cache')
              .update({ rank: i + 1 })
              .eq('id', results[i].id)
          }
        }

        const eventCode = (round as Record<string, unknown> & { events: { code: string } }).events?.code
        if (eventCode) {
          await supabase.channel(`round:${eventCode}`).send({
            type: 'broadcast',
            event: 'status_change',
            payload: { round_id, status: 'closed' },
          })
        }

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

        // 取排行榜
        const { data: rankings } = await supabase
          .from('results_cache')
          .select('*')
          .eq('round_id', round_id)
          .order('rank', { ascending: true })

        const eventCode = (round as Record<string, unknown> & { events: { code: string } }).events?.code
        if (eventCode) {
          await supabase.channel(`round:${eventCode}`).send({
            type: 'broadcast',
            event: 'status_change',
            payload: { round_id, status: 'revealed', rankings },
          })
        }

        return NextResponse.json({ success: true, rankings })
      }

      case 'manual_score': {
        // 手動加減分（歡呼裁決制用）
        const { table_id, score_delta } = data as { table_id: string; score_delta: number }
        if (!round_id || !table_id) {
          return NextResponse.json({ error: '缺少參數' }, { status: 400 })
        }

        await supabase.rpc('increment_result_cache', {
          p_round_id: round_id,
          p_target_type: 'table',
          p_target_id: table_id,
          p_score: score_delta,
        })

        return NextResponse.json({ success: true })
      }

      case 'countdown': {
        // 設定倒數
        const seconds = (data as { seconds: number })?.seconds ?? 30
        if (!event_id) return NextResponse.json({ error: '缺少 event_id' }, { status: 400 })

        const { data: event } = await supabase
          .from('events')
          .select('code')
          .eq('id', event_id)
          .single()

        if (event?.code) {
          await supabase.channel(`control:${event.code}`).send({
            type: 'broadcast',
            event: 'command',
            payload: { action: 'start_countdown', countdown: seconds },
          })
        }

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: `未知的動作: ${action}` }, { status: 400 })
    }
  } catch (err) {
    console.error('[Admin/Round] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
