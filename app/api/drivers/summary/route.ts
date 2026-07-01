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

    const { data: schedules, error } = await query.order('unload_date', { ascending: false })
    if (error) throw error

    const { data: drivers } = await supabase.from('drivers').select('id, name, payment_percentage').eq('is_active', true)
    const { data: youshas } = await supabase.from('youshas').select('id, name, display_name')

    const driverMap: Record<string, string> = {}
    for (const d of drivers || []) driverMap[d.id] = d.name
    for (const y of youshas || []) driverMap[`y_${y.id}`] = y.display_name || y.name

    const pctMap: Record<string, number> = {}
    for (const d of drivers || []) pctMap[d.id] = Number(d.payment_percentage) || 0

    const driverSummary: Record<string, {
      driver_name: string
      payment_percentage: number
      total_sales: number
      payment_amount: number
      count: number
    }> = {}

    for (const s of schedules || []) {
      const did = s.driver_id || 'unassigned'
      if (!did || did === 'unassigned') continue
      const dname = driverMap[did] || '不明'
      const pct = pctMap[did] || 0
      if (!driverSummary[did]) {
        driverSummary[did] = { driver_name: dname, payment_percentage: pct, total_sales: 0, payment_amount: 0, count: 0 }
      }
      driverSummary[did].count += 1
    }

    return Response.json({ dispatches: schedules, summary: driverSummary })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
