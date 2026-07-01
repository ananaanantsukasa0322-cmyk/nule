import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')
    const driverId = request.nextUrl.searchParams.get('driver_id')

    let query = supabase.from('schedules').select('*')
    if (dateFrom) query = query.gte('unload_date', dateFrom)
    if (dateTo) query = query.lte('unload_date', dateTo)
    if (driverId) query = query.eq('driver_id', driverId)

    const [schedulesRes, driversRes, youshasRes, pricesRes] = await Promise.all([
      query.order('unload_date', { ascending: false }),
      supabase.from('drivers').select('id, name, payment_percentage').eq('is_active', true),
      supabase.from('youshas').select('id, name, display_name'),
      supabase.from('prices').select('*').eq('is_active', true),
    ])

    if (schedulesRes.error) throw schedulesRes.error

    const schedules = schedulesRes.data || []
    const drivers = driversRes.data || []
    const youshas = youshasRes.data || []
    const prices = pricesRes.data || []

    const driverMap: Record<string, string> = {}
    for (const d of drivers) driverMap[d.id] = d.name
    for (const y of youshas) driverMap[`y_${y.id}`] = y.display_name || y.name

    const pctMap: Record<string, number> = {}
    for (const d of drivers) pctMap[d.id] = Number(d.payment_percentage) || 0

    function matchPlace(pp: string, sp: string): boolean {
      if (!pp || !sp) return !pp
      if (pp === sp) return true
      if (sp.includes(pp) || pp.includes(sp)) return true
      return false
    }

    function findPrice(s: { client_name?: string; load_place?: string; unload_place?: string; weight?: number }) {
      const vt = (s.weight || 0) >= 15000 ? 'トレーラー' : '大型'
      function search(matchFn: (p: typeof prices[0]) => boolean) {
        return prices.find(p => matchFn(p) && p.vehicle_type === vt)
          || prices.find(p => matchFn(p) && !p.vehicle_type)
      }
      let p = search(p => p.client_name === s.client_name && p.load_place === s.load_place && p.unload_place === s.unload_place)
      if (!p) p = search(p => p.client_name === s.client_name && matchPlace(p.load_place ?? '', s.load_place ?? '') && matchPlace(p.unload_place ?? '', s.unload_place ?? ''))
      if (!p) p = search(p => p.client_name === s.client_name && !p.load_place && !p.unload_place)
      return p
    }

    function calcAmount(s: { weight?: number }, p: typeof prices[0] | undefined): number {
      if (!p) return 0
      if (p.price_type === 'per_ton' && p.per_ton_rate) return Math.round(p.per_ton_rate * (s.weight || 0) / 1000)
      if (p.fixed_amount) return p.fixed_amount
      return 0
    }

    const driverSummary: Record<string, {
      driver_name: string
      payment_percentage: number
      total_sales: number
      payment_amount: number
      count: number
    }> = {}

    for (const s of schedules) {
      const did = s.driver_id || 'unassigned'
      if (!did || did === 'unassigned') continue
      const dname = driverMap[did] || '不明'
      const pct = pctMap[did] || 0
      if (!driverSummary[did]) {
        driverSummary[did] = { driver_name: dname, payment_percentage: pct, total_sales: 0, payment_amount: 0, count: 0 }
      }
      const amount = calcAmount(s, findPrice(s))
      driverSummary[did].count += 1
      driverSummary[did].total_sales += amount
    }

    for (const did of Object.keys(driverSummary)) {
      const d = driverSummary[did]
      d.payment_amount = Math.round(d.total_sales * d.payment_percentage / 100)
    }

    return Response.json({ dispatches: schedules, summary: driverSummary })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
