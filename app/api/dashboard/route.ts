import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildDriverNameMap } from '@/lib/resolve-drivers'

export async function GET() {
  try {
    await requireAuth(['admin', 'office'])

    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    const [schedulesRes, reportsRes, driversRes] = await Promise.all([
      supabase.from('schedules').select('*').gte('load_date', firstDay).lte('load_date', lastDay),
      supabase.from('daily_reports').select('id').eq('status', 'pending'),
      supabase.from('drivers').select('*').eq('is_active', true),
    ])

    const schedules = schedulesRes.data || []
    const pendingReports = reportsRes.data || []
    const drivers = driversRes.data || []

    const driverMap = await buildDriverNameMap()

    const driverSales: Record<string, { name: string; total: number }> = {}
    for (const s of schedules) {
      const did = s.driver_id || 'unassigned'
      if (!did || did === 'unassigned') continue
      const dname = driverMap[did] || '不明'
      if (!driverSales[did]) driverSales[did] = { name: dname, total: 0 }
      driverSales[did].total += 1
    }

    const driverSalesList = Object.entries(driverSales)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)

    return Response.json({
      total_sales: 0,
      client_ranking: [],
      driver_sales: driverSalesList,
      pending_reports_count: pendingReports.length,
      total_dispatches: schedules.length,
      total_drivers: drivers.length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
