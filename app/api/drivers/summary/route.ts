import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')
    const driverId = request.nextUrl.searchParams.get('driver_id')

    let query = supabase
      .from('dispatches')
      .select('*, driver:drivers(*), client:clients(*)')
      .in('status', ['confirmed', 'completed'])

    if (dateFrom) query = query.gte('dispatch_date', dateFrom)
    if (dateTo) query = query.lte('dispatch_date', dateTo)
    if (driverId) query = query.eq('driver_id', driverId)

    const { data, error } = await query.order('dispatch_date', { ascending: false })

    if (error) throw error

    const driverSummary: Record<string, {
      driver_name: string
      payment_percentage: number
      total_sales: number
      payment_amount: number
      count: number
    }> = {}

    for (const d of data || []) {
      const did = d.driver_id || 'unknown'
      const dname = d.driver?.name || '不明'
      const pct = Number(d.driver?.payment_percentage) || 0
      if (!driverSummary[did]) {
        driverSummary[did] = {
          driver_name: dname,
          payment_percentage: pct,
          total_sales: 0,
          payment_amount: 0,
          count: 0,
        }
      }
      const amount = Number(d.calculated_amount) || 0
      driverSummary[did].total_sales += amount
      driverSummary[did].payment_amount += Math.floor(amount * pct / 100)
      driverSummary[did].count += 1
    }

    return Response.json({
      dispatches: data,
      summary: driverSummary,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
