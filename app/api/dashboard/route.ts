import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth(['admin'])

    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0]

    const [dispatchesRes, reportsRes, driversRes] = await Promise.all([
      supabase
        .from('dispatches')
        .select('*, client:clients(company_name), driver:drivers(name)')
        .gte('dispatch_date', firstDayOfMonth)
        .lte('dispatch_date', lastDayOfMonth)
        .in('status', ['confirmed', 'completed']),
      supabase
        .from('daily_reports')
        .select('id')
        .eq('status', 'pending'),
      supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true),
    ])

    const dispatches = dispatchesRes.data || []
    const pendingReports = reportsRes.data || []
    const drivers = driversRes.data || []

    const totalSales = dispatches.reduce(
      (sum, d) => sum + (Number(d.calculated_amount) || 0),
      0
    )

    const clientRanking: Record<string, { name: string; total: number }> = {}
    for (const d of dispatches) {
      const cid = d.client_id || 'unknown'
      const cname = d.client?.company_name || '不明'
      if (!clientRanking[cid]) clientRanking[cid] = { name: cname, total: 0 }
      clientRanking[cid].total += Number(d.calculated_amount) || 0
    }

    const sortedClientRanking = Object.entries(clientRanking)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)

    const driverSales: Record<string, { name: string; total: number }> = {}
    for (const d of dispatches) {
      const did = d.driver_id || 'unknown'
      const dname = d.driver?.name || '不明'
      if (!driverSales[did]) driverSales[did] = { name: dname, total: 0 }
      driverSales[did].total += Number(d.calculated_amount) || 0
    }

    const driverSalesList = Object.entries(driverSales)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)

    return Response.json({
      total_sales: totalSales,
      client_ranking: sortedClientRanking,
      driver_sales: driverSalesList,
      pending_reports_count: pendingReports.length,
      total_dispatches: dispatches.length,
      total_drivers: drivers.length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
