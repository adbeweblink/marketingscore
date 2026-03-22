import { NextRequest, NextResponse } from 'next/server'
import { voteSchema, checkSelfVote, checkRoundOpen } from '@/lib/anti-cheat'
import { createAdminSupabase } from '@/lib/supabase/server'
import { verifyParticipantToken } from '@/lib/auth'

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

    // 2. JWT 驗證身份（#1 fix: 不再信任 client header）
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: '未登入' }, { status: 401 })
    }
    const payload = verifyParticipantToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'token 無效或已過期' }, { status: 401 })
    }
    const participantId = payload.sub

    const supabase = createAdminSupabase()

    // 3. 查詢回合狀態（JOIN events 取 code，減少一次查詢 #18 fix）
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('id, status, config, type_id, event_id, events(code)')
      .eq('id', round_id)
      .single()

    if (roundError || !round) {
      return NextResponse.json({ error: '回合不存在' }, { status: 404 })
    }

    // 4. 檢查回合是否開放
    const roundCheck = checkRoundOpen(round.status)
    if (!roundCheck.passed) {
      return NextResponse.json({ error: roundCheck.error }, { status: 403 })
    }

    // 5. 驗證 JWT 中的 event_id 與 round 的 event_id 一致
    if (payload.event_id !== round.event_id) {
      return NextResponse.json({ error: '參與者不屬於此活動' }, { status: 403 })
    }

    // 6. 查詢投票者所屬的組別
    const { data: voterGroups } = await supabase
      .from('group_tables')
      .select('group_id')
      .eq('table_id', payload.table_id)

    const voterGroupIds = (voterGroups ?? []).map((g: { group_id: string }) => g.group_id)

    // 7. 防作弊：不能評自己桌/組
    const selfCheck = checkSelfVote(
      payload.table_id,
      target_table_id,
      target_group_id,
      voterGroupIds,
      round.config?.allow_self_vote ?? false
    )
    if (!selfCheck.passed) {
      return NextResponse.json({ error: selfCheck.error }, { status: 403 })
    }

    // 8. 寫入投票
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

    // 9. 更新 results_cache（#96 fix: 檢查 RPC error）
    const targetId = target_table_id ?? target_group_id
    const targetType = target_table_id ? 'table' : 'group'
    if (targetId && score !== undefined) {
      const { error: cacheError } = await supabase.rpc('increment_result_cache', {
        p_round_id: round_id,
        p_target_type: targetType,
        p_target_id: targetId,
        p_score: score,
      })
      if (cacheError) {
        console.error('[Vote] Cache update failed:', cacheError)
      }
    }

    // #10 fix: Server 端不直接 broadcast
    // 前端透過 Supabase Realtime postgres_changes 監聽 results_cache 變更
    // 或前端每 3 秒 polling results API 作為 fallback

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Vote] Unexpected error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
