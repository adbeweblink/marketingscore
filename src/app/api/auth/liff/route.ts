import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { signParticipantToken } from '@/lib/auth'

/** 參與者加入活動（暱稱登入 / LIFF 登入） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event_code, table_number, display_name, liff_id_token, avatar_url } = body as {
      event_code: string
      table_number: number
      display_name: string
      liff_id_token?: string
      avatar_url?: string
    }

    if (!event_code || !table_number || !display_name || display_name.trim().length === 0) {
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

    // #8 fix: 檢查活動狀態
    if (event.status !== 'active' && event.status !== 'draft') {
      return NextResponse.json({ error: '活動尚未開始或已結束' }, { status: 403 })
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

    // #4 fix: 驗證 LINE LIFF token
    let lineUserId: string | null = null
    if (liff_id_token) {
      try {
        const lineRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            id_token: liff_id_token,
            client_id: process.env.LINE_CHANNEL_ID!,
          }),
        })
        if (!lineRes.ok) {
          return NextResponse.json({ error: 'LINE 驗證失敗' }, { status: 401 })
        }
        const lineData = await lineRes.json()
        lineUserId = lineData.sub
      } catch {
        return NextResponse.json({ error: 'LINE 驗證失敗' }, { status: 401 })
      }
    }

    // #15 fix: 驗證 avatar_url 格式
    const safeAvatarUrl = avatar_url && avatar_url.startsWith('https://') ? avatar_url : null

    // 3. 建立或更新參與者
    const trimmedName = display_name.trim().slice(0, 20)
    const participantData = {
      event_id: event.id,
      table_id: table.id,
      display_name: trimmedName,
      line_user_id: lineUserId,
      avatar_url: safeAvatarUrl,
    }

    let participant
    if (lineUserId) {
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
      // #28 fix: 暱稱登入也做 upsert（by event_id + display_name + table_id）
      // 先查是否已存在
      const { data: existing } = await supabase
        .from('participants')
        .select('id')
        .eq('event_id', event.id)
        .eq('table_id', table.id)
        .eq('display_name', trimmedName)
        .single()

      if (existing) {
        participant = existing
      } else {
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
    }

    // 4. 簽發 JWT（#1 fix）
    const token = signParticipantToken({
      sub: participant.id,
      event_id: event.id,
      table_id: table.id,
      table_number: table.number,
    })

    // 5. 取得活動桌次列表
    const { data: tables } = await supabase
      .from('tables')
      .select('id, number, name')
      .eq('event_id', event.id)
      .order('number')

    // 6. 取得目前回合
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
      token, // JWT token
      participant: {
        id: participant.id,
        display_name: trimmedName,
        table_id: table.id,
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
