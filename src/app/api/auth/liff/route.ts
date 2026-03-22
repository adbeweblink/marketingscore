import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'

/** 參與者加入活動（暱稱登入 / LIFF 登入） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event_code, table_number, display_name, line_user_id, avatar_url } = body as {
      event_code: string
      table_number: number
      display_name: string
      line_user_id?: string
      avatar_url?: string
    }

    if (!event_code || !table_number || !display_name) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const supabase = createAdminSupabase()

    // 1. 查詢活動
    const { data: event } = await supabase
      .from('events')
      .select('id, name, status, config')
      .eq('code', event_code.toUpperCase())
      .single()

    if (!event) {
      return NextResponse.json({ error: '活動不存在，請確認代碼' }, { status: 404 })
    }

    // 2. 查詢桌次
    const { data: table } = await supabase
      .from('tables')
      .select('id, number')
      .eq('event_id', event.id)
      .eq('number', table_number)
      .single()

    if (!table) {
      return NextResponse.json({ error: `第 ${table_number} 桌不存在` }, { status: 404 })
    }

    // 3. 建立或更新參與者
    const participantData = {
      event_id: event.id,
      table_id: table.id,
      display_name: display_name.trim().slice(0, 20),
      line_user_id: line_user_id ?? null,
      avatar_url: avatar_url ?? null,
    }

    let participant
    if (line_user_id) {
      // LINE 登入：用 line_user_id 做 upsert
      const { data, error } = await supabase
        .from('participants')
        .upsert(participantData, { onConflict: 'event_id,line_user_id' })
        .select()
        .single()

      if (error) {
        console.error('[Auth] Upsert error:', error)
        return NextResponse.json({ error: '加入失敗' }, { status: 500 })
      }
      participant = data
    } else {
      // 暱稱登入：直接 insert
      const { data, error } = await supabase
        .from('participants')
        .insert(participantData)
        .select()
        .single()

      if (error) {
        console.error('[Auth] Insert error:', error)
        return NextResponse.json({ error: '加入失敗' }, { status: 500 })
      }
      participant = data
    }

    // 4. 取得活動桌次列表（給前端用）
    const { data: tables } = await supabase
      .from('tables')
      .select('id, number, name')
      .eq('event_id', event.id)
      .order('number')

    // 5. 取得目前回合
    const { data: currentRound } = await supabase
      .from('rounds')
      .select('*')
      .eq('event_id', event.id)
      .in('status', ['open', 'pending'])
      .order('seq')
      .limit(1)
      .single()

    return NextResponse.json({
      success: true,
      participant: {
        id: participant.id,
        display_name: participant.display_name,
        table_id: participant.table_id,
        table_number: table.number,
      },
      event: {
        id: event.id,
        name: event.name,
        code: event_code,
        config: event.config,
      },
      tables: tables ?? [],
      current_round: currentRound,
    })
  } catch (err) {
    console.error('[Auth] Unexpected error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
