import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'

/**
 * 輕量快速的活動即時狀態端點
 * 設計目標：< 100ms，只做 2 個 query
 * 供三方（主持人、參與者手機、大螢幕）每秒 polling 使用
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    const supabase = createAdminSupabase()

    // Query 1：查活動基本狀態
    const { data: event } = await supabase
      .from('events')
      .select('id, name, status')
      .eq('code', code.toUpperCase())
      .single()

    if (!event) {
      return NextResponse.json({ error: '活動不存在' }, { status: 404 })
    }

    // Query 2：查當前回合（只拿需要的欄位，不拿完整 results）
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, seq, title, type_id, status, config')
      .eq('event_id', event.id)
      .order('seq')

    const currentRound = rounds?.find((r) => r.status === 'open')
      ?? rounds?.find((r) => r.status === 'closed')
      ?? rounds?.find((r) => r.status === 'revealed')
      ?? null

    // 計算投票數（只在有 open 回合時才查，避免不必要的 DB 查詢）
    let voteCount = 0
    let participantCount = 0

    if (currentRound) {
      // 並行查詢投票數與參與人數（減少延遲）
      const [votesRes, participantsRes] = await Promise.all([
        supabase
          .from('votes')
          .select('id', { count: 'exact', head: true })
          .eq('round_id', currentRound.id)
          .eq('is_valid', true),
        supabase
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id),
      ])

      voteCount = votesRes.count ?? 0
      participantCount = participantsRes.count ?? 0
    } else {
      // 無進行中回合時仍回傳參與人數
      const { count } = await supabase
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
      participantCount = count ?? 0
    }

    return NextResponse.json({
      current_round_id: currentRound?.id ?? null,
      current_round_status: currentRound?.status ?? null,
      current_round_title: currentRound?.title ?? null,
      current_round_seq: currentRound?.seq ?? null,
      current_round_type: currentRound?.type_id ?? null,
      current_round_config: currentRound?.config ?? null,
      vote_count: voteCount,
      participant_count: participantCount,
      event_status: event.status,
      // 附帶完整 rounds 清單，讓前端不需要額外呼叫 /status
      rounds: rounds ?? [],
    })
  } catch (err) {
    console.error('[Live] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
