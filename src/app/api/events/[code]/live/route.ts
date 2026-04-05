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

    // Query 1：查活動基本狀態（含 config，供讀取 display_mode）
    const { data: event } = await supabase
      .from('events')
      .select('id, name, status, config')
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
    let recentVoters: string[] = []
    let votesPerPerson = 1 // 每人需投幾票（組數-1 或桌數-1）

    if (currentRound) {
      // 並行查詢投票數、參與人數、最近 30 秒投票者名字
      const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString()
      const [votesRes, participantsRes, recentVotesRes, groupsRes, tablesRes] = await Promise.all([
        supabase
          .from('votes')
          .select('id', { count: 'exact', head: true })
          .eq('round_id', currentRound.id)
          .eq('is_valid', true),
        supabase
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id),
        currentRound.status === 'open'
          ? supabase
              .from('votes')
              .select('participant_id, participant:participants(display_name)')
              .eq('round_id', currentRound.id)
              .eq('is_valid', true)
              .limit(500)
          : Promise.resolve({ data: [] }),
        supabase.from('groups').select('id').eq('event_id', event.id),
        supabase.from('tables').select('id').eq('event_id', event.id),
      ])

      voteCount = votesRes.count ?? 0
      participantCount = participantsRes.count ?? 0

      const groupsData = groupsRes.data
      const tablesData = tablesRes.data
      const targetCount = (groupsData?.length ?? 0) > 0
        ? (groupsData?.length ?? 0) - 1
        : (tablesData?.length ?? 0) - 1
      votesPerPerson = Math.max(1, targetCount)

      // 找出「全部投完」的人（投票數 >= targetCount）
      if (targetCount > 0) {
        const votesByPerson = new Map<string, { count: number; name: string }>()
        for (const row of (recentVotesRes.data ?? []) as unknown as Array<{ participant_id: string; participant: { display_name: string } | null }>) {
          const pid = row.participant_id
          const name = row.participant?.display_name ?? ''
          if (!pid || !name) continue
          const existing = votesByPerson.get(pid)
          if (existing) {
            existing.count++
          } else {
            votesByPerson.set(pid, { count: 1, name })
          }
        }
        // 只有投票數達標的人才出金球
        for (const { count, name } of votesByPerson.values()) {
          if (count >= targetCount) {
            recentVoters.push(name)
          }
        }
      }
    } else {
      // 無進行中回合時仍回傳參與人數
      const { count } = await supabase
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
      participantCount = count ?? 0
    }

    // 從 event config 讀取主持人手動設定的 display_mode（'auto' 或未設定表示跟隨回合狀態）
    const eventConfig = (event.config as Record<string, unknown>) ?? {}
    const displayMode = (eventConfig.display_mode as string) ?? 'auto'
    const countdownEnd = (eventConfig.countdown_end as string) ?? null

    return NextResponse.json({
      current_round_id: currentRound?.id ?? null,
      current_round_status: currentRound?.status ?? null,
      current_round_title: currentRound?.title ?? null,
      current_round_seq: currentRound?.seq ?? null,
      current_round_type: currentRound?.type_id ?? null,
      current_round_config: currentRound?.config ?? null,
      vote_count: voteCount,
      votes_per_person: votesPerPerson,
      participant_count: participantCount,
      recent_voters: recentVoters,
      event_status: event.status,
      display_mode: displayMode,
      // 倒數計時結束時間（ISO string），前端用 Date.now() 算剩餘秒數
      countdown_end: countdownEnd,
      rounds: rounds ?? [],
    })
  } catch (err) {
    console.error('[Live] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
