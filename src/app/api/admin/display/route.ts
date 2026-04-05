import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { verifyAdminKey } from '@/lib/auth'

/**
 * 允許的大螢幕顯示模式
 * 'auto' = 跟隨回合狀態自動切換（預設）
 */
export type DisplayMode = 'auto' | 'idle' | 'round-intro' | 'voting' | 'leaderboard' | 'final'

/**
 * POST /api/admin/display
 * 主持人手動設定大螢幕顯示模式
 * body: { event_id: string, display_mode: DisplayMode }
 */
export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key')
    if (!verifyAdminKey(adminKey)) {
      return NextResponse.json({ error: '權限不足' }, { status: 401 })
    }

    const body = await request.json()
    const { event_id, display_mode } = body as { event_id: string; display_mode: DisplayMode }

    if (!event_id) {
      return NextResponse.json({ error: '缺少 event_id' }, { status: 400 })
    }

    const validModes: DisplayMode[] = ['auto', 'idle', 'round-intro', 'voting', 'leaderboard', 'final']
    if (!validModes.includes(display_mode)) {
      return NextResponse.json({ error: '無效的 display_mode' }, { status: 400 })
    }

    const supabase = createAdminSupabase()

    // 取得目前 config（保留其他欄位）
    const { data: event } = await supabase
      .from('events')
      .select('config')
      .eq('id', event_id)
      .single()

    if (!event) {
      return NextResponse.json({ error: '活動不存在' }, { status: 404 })
    }

    const currentConfig = (event.config as Record<string, unknown>) ?? {}

    // 更新 config，注入 display_mode
    const { error: updateError } = await supabase
      .from('events')
      .update({
        config: {
          ...currentConfig,
          display_mode,
        },
      })
      .eq('id', event_id)

    if (updateError) {
      console.error('[Display] Update error:', updateError)
      return NextResponse.json({ error: '更新失敗' }, { status: 500 })
    }

    return NextResponse.json({ success: true, display_mode })
  } catch (err) {
    console.error('[Display] Error:', err)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
