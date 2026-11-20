import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildDriverNameMap } from '@/lib/resolve-drivers'
import { fetchAllRows } from '@/lib/supabase-paginate'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')

    function buildQuery() {
      let query = supabase.from('schedules').select('*')
      // 荷主によっては締め日を積み日基準で判定したいケースがあるため、下ろし日・積み日の
      // どちらかが期間内に入っていれば候補として取得し、実際の絞り込みはフロント側で荷主ごとに行う
      if (dateFrom && dateTo) {
        query = query.or(`and(load_date.gte.${dateFrom},load_date.lte.${dateTo}),and(unload_date.gte.${dateFrom},unload_date.lte.${dateTo})`)
      } else if (dateFrom) {
        query = query.or(`load_date.gte.${dateFrom},unload_date.gte.${dateFrom}`)
      } else if (dateTo) {
        query = query.or(`load_date.lte.${dateTo},unload_date.lte.${dateTo}`)
      }
      // unload_dateが同じ場合の並びを不定順にしないため、登録日時を明示的な第2キーにする
      return query.order('unload_date', { ascending: false }).order('created_at', { ascending: true })
    }

    // 件数が1000件を超えるとSupabaseが黙って切り詰めるため、fetchAllRowsで全件をページングして取得する
    const data = await fetchAllRows((from, to) => buildQuery().range(from, to))

    const driverMap = await buildDriverNameMap()

    const enriched = (data || []).map(s => ({
      ...s,
      dispatch_date: s.load_date,
      driver: { name: driverMap[s.driver_id] || '未割当' },
      route: s.load_place && s.unload_place ? { departure: s.load_place, destination: s.unload_place } : null,
      calculated_amount: 0,
    }))

    return Response.json({
      dispatches: enriched,
      summary: {},
      total_amount: 0,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
