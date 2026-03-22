import { NextRequest, NextResponse } from 'next/server'
import { voteSchema, checkSelfVote, checkRoundOpen } from '@/lib/anti-cheat'
import { createAdminSupabase } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 1. 驗證輸入格式
    const parsed = voteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '輸入格式錯誤', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { round_id, target_table_id, target_group_id, score, answer } = parsed.data

    // 從 header 取得 participant_id（JWT 驗證後注入）
    const participantId = request.headers.get('x-participant-id')
    if (!participantId) {
      return NextResponse.json({ error: '未登入' }, { status: 401 })
    }

    const supabase = createAdminSupabase()

    // 2. 查詢回合狀態
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('id, status, config, type_id, event_id')
      .eq('id', round_id)
      .single()

    if (roundError || !round) {
      return NextResponse.json({ error: '回合不存在' }, { status: 404 })
    }

    // 3. 檢查回合是否開放
    const roundCheck = checkRoundOpen(round.status)
    if (!roundCheck.passed) {
      return NextResponse.json({ error: roundCheck.error }, { status: 403 })
    }

    // 4. 查詢投票者的桌次
    const { data: participant } = await supabase
      .from('participants')
      .select('id, table_id, event_id')
      .eq('id', participantId)
      .single()

    if (!participant || participant.event_id !== round.event_id) {
      return NextResponse.json({ error: '參與者資料異常' }, { status: 403 })
    }

    // 5. 查詢投票者所屬的組別
    const { data: voterGroups } = await supabase
      .from('group_tables')
      .select('group_id')
      .eq('table_id', participant.table_id)

    const voterGroupIds = (voterGroups ?? []).map((g: { group_id: string }) => g.group_id)

    // 6. 防作弊：不能評自己桌/組
    const selfCheck = checkSelfVote(
      participant.table_id,
      target_table_id,
      target_group_id,
      voterGroupIds,
      round.config?.allow_self_vote ?? false
    )
    if (!selfCheck.passed) {
      return NextResponse.json({ error: selfCheck.error }, { status: 403 })
    }

    // 7. 寫入投票
    const { error: voteError } = await supabase.from('votes').insert({
      round_id,
      participant_id: participantId,
      target_table_id: target_table_id ?? null,
      target_group_id: target_group_id ?? null,
      score: score ?? null,
      answer: answer ?? null,
      is_valid: true,
    })

    if (voteError) {
      if (voteError.code === '23505') {
        return NextResponse.json({ error: '你已經投過票了' }, { status: 409 })
      }
      console.error('[Vote] Insert error:', voteError)
      return NextResponse.json({ error: '投票失敗' }, { status: 500 })
    }

    // 8. 更新 results_cache（預計算）
    if (target_table_id && score !== undefined) {
      await supabase.rpc('increment_result_cache', {
        p_round_id: round_id,
        p_target_type: 'table',
        p_target_id: target_table_id,
        p_score: score,
      })
    } else if (target_group_id && score !== undefined) {
      await supabase.rpc('increment_result_cache', {
        p_round_id: round_id,
        p_target_type: 'group',
        p_target_id: target_group_id,
        p_score: score,
      })
    }

    // 9. 取得投票進度
    const { count: votedCount } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', round_id)

    const { count: totalCount } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', round.event_id)

    // 10. 透過 Realtime 廣播更新
    const eventCode = await getEventCode(supabase, round.event_id)
    if (eventCode) {
      await supabase.channel(`event:${eventCode}`).send({
        type: 'broadcast',
        event: 'score_update',
        payload: {
          round_id,
          voted: votedCount ?? 0,
          total: totalCount ?? 0,
          entity_id: target_table_id ?? target_group_id,
          score,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Vote] Unexpected error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}

async function getEventCode(supabase: ReturnType<typeof createAdminSupabase>, eventId: string) {
  const { data } = await supabase
    .from('events')
    .select('code')
    .eq('id', eventId)
    .single()
  return data?.code
}
