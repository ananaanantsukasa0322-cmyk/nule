import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// 積み地・下ろし先の名称を一括変更（マスタ＋過去のschedules/prices全件に反映）
export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const body = await request.json()
    const type = body.type as 'load' | 'unload'
    const oldName = (body.oldName || '').trim()
    const newName = (body.newName || '').trim()
    if (!type || !oldName || !newName) {
      return Response.json({ error: 'type / oldName / newName が必要です' }, { status: 400 })
    }
    if (oldName === newName) {
      return Response.json({ schedules: 0, prices: 0, master: 0 })
    }

    // load_places は独立テーブルではなく、places テーブルを place_type='load' で絞ったもの
    const schedField = type === 'load' ? 'load_place' : 'unload_place'
    const priceField = type === 'load' ? 'load_place' : 'unload_place'

    // マスタ本体の名前を更新
    const { data: masterRows, error: masterErr } = await supabase
      .from('places')
      .update({ name: newName })
      .eq('name', oldName)
      .eq('place_type', type)
      .select('id')
    if (masterErr) throw masterErr

    // 過去の配車実績を一括更新
    const { data: schedRows, error: schedErr } = await supabase
      .from('schedules')
      .update({ [schedField]: newName })
      .eq(schedField, oldName)
      .select('id')
    if (schedErr) throw schedErr

    // 単価マスタも一括更新
    const { data: priceRows, error: priceErr } = await supabase
      .from('prices')
      .update({ [priceField]: newName })
      .eq(priceField, oldName)
      .select('id')
    if (priceErr) throw priceErr

    return Response.json({
      master: masterRows?.length || 0,
      schedules: schedRows?.length || 0,
      prices: priceRows?.length || 0,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e))
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
