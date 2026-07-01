import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildDriverNameMap } from '@/lib/resolve-drivers'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')

    let query = supabase.from('schedules').select('*')
    if (dateFrom) query = query.gte('unload_date', dateFrom)
    if (dateTo) query = query.lte('unload_date', dateTo)

    const { data, error } = await query.order('unload_date', { ascending: false })
    if (error) throw error

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
