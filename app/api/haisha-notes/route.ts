import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// 配車予定表の「空き行」に手打ち入力した運転手名・車番・積荷テキストを保存する。
// 以前はブラウザのlocalStorageのみに保存していたため、別のPCからは見えなかった。

export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabase.from('haisha_row_notes').select('*')
    if (error) throw error
    return Response.json(data || [])
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const rowUid = body.row_uid as string
    const field = body.field as string
    const value = body.value as string
    if (!rowUid || !['name', 'vehicle_num', 'payload'].includes(field)) {
      return Response.json({ error: 'row_uid / field が不正です' }, { status: 400 })
    }
    const { data: existing } = await supabase.from('haisha_row_notes').select('*').eq('row_uid', rowUid).maybeSingle()
    const { data, error } = await supabase
      .from('haisha_row_notes')
      .upsert({ ...(existing || {}), row_uid: rowUid, [field]: value, updated_at: new Date().toISOString() }, { onConflict: 'row_uid' })
      .select()
      .single()
    if (error) throw error
    return Response.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
