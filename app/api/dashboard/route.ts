import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildDriverNameMap } from '@/lib/resolve-drivers'

export async function GET() {
  try {
    await requireAuth(['admin', 'office'])

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const firstDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const lastDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()}`

    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevFirstDay = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth()+1).padStart(2,'0')}-01`
    const prevLastDay = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth()+1).padStart(2,'0')}-${new Date(prevMonth.getFullYear(), prevMonth.getMonth()+1, 0).getDate()}`

    const [thisMonthRes, prevMonthRes, todayRes, pricesRes, driversRes] = await Promise.all([
      supabase.from('schedules').select('*').gte('load_date', firstDay).lte('load_date', lastDay),
      supabase.from('schedules').select('id,weight,client_name').gte('load_date', prevFirstDay).lte('load_date', prevLastDay),
      supabase.from('schedules').select('*').eq('load_date', today),
      supabase.from('prices').select('*').eq('is_active', true),
      supabase.from('drivers').select('id,name').eq('is_active', true),
    ])

    const schedules = thisMonthRes.data || []
    const prevSchedules = prevMonthRes.data || []
    const todaySchedules = todayRes.data || []
    const prices = pricesRes.data || []
    const driverMap = await buildDriverNameMap()

    // --- 今日の状況 ---
    const todayCount = todaySchedules.length
    const todayDrivers = new Set(todaySchedules.map(s => s.driver_id).filter(Boolean)).size
    const todayWeight = todaySchedules.reduce((sum, s) => sum + (s.weight || 0), 0)
    const todayUnassigned = todaySchedules.filter(s => !s.driver_id).length

    // --- 今月の実績 ---
    const thisMonthCount = schedules.length
    const thisMonthWeight = schedules.reduce((sum, s) => sum + (s.weight || 0), 0)
    const prevMonthCount = prevSchedules.length
    const prevMonthWeight = prevSchedules.reduce((sum, s) => sum + (s.weight || 0), 0)

    // 売上計算
    function calcRevenue(scheds: typeof schedules) {
      let total = 0
      for (const s of scheds) {
        const vt = (s.weight || 0) >= 15000 ? 'トレーラー' : '大型'
        const p = prices.find(p =>
          p.client_name === s.client_name &&
          (p.load_place === s.load_place || (s.load_place && p.load_place && s.load_place.includes(p.load_place))) &&
          (p.unload_place === s.unload_place || (s.unload_place && p.unload_place && s.unload_place.includes(p.unload_place))) &&
          (!p.vehicle_type || p.vehicle_type === vt)
        ) || prices.find(p =>
          p.client_name === s.client_name &&
          (p.load_place === s.load_place || (s.load_place && p.load_place && s.load_place.includes(p.load_place))) &&
          (p.unload_place === s.unload_place || (s.unload_place && p.unload_place && s.unload_place.includes(p.unload_place))) &&
          !p.vehicle_type
        )
        if (p) {
          if (p.price_type === 'per_ton' && p.per_ton_rate) total += Math.round(p.per_ton_rate * (s.weight || 0) / 1000)
          else if (p.fixed_amount) total += p.fixed_amount
        }
      }
      return total
    }
    const thisMonthRevenue = calcRevenue(schedules)
    const prevMonthRevenue = calcRevenue(prevSchedules)

    // --- 荷主別売上ランキング ---
    const clientRevenue: Record<string, { name: string; count: number; revenue: number; weight: number }> = {}
    for (const s of schedules) {
      const cn = s.client_name || '未設定'
      if (!clientRevenue[cn]) clientRevenue[cn] = { name: cn, count: 0, revenue: 0, weight: 0 }
      clientRevenue[cn].count += 1
      clientRevenue[cn].weight += s.weight || 0
      const vt = (s.weight || 0) >= 15000 ? 'トレーラー' : '大型'
      const p = prices.find(p => p.client_name === s.client_name && (!p.vehicle_type || p.vehicle_type === vt))
      if (p) {
        if (p.price_type === 'per_ton' && p.per_ton_rate) clientRevenue[cn].revenue += Math.round(p.per_ton_rate * (s.weight || 0) / 1000)
        else if (p.fixed_amount) clientRevenue[cn].revenue += p.fixed_amount
      }
    }
    const clientRanking = Object.values(clientRevenue).sort((a, b) => b.revenue - a.revenue || b.count - a.count)

    // --- ドライバー別稼働 ---
    const driverStats: Record<string, { name: string; count: number; weight: number }> = {}
    for (const s of schedules) {
      const did = s.driver_id || ''
      if (!did) continue
      const dname = driverMap[did] || '不明'
      if (!driverStats[did]) driverStats[did] = { name: dname, count: 0, weight: 0 }
      driverStats[did].count += 1
      driverStats[did].weight += s.weight || 0
    }
    const driverList = Object.values(driverStats).sort((a, b) => b.count - a.count)

    // --- 週間推移（直近7日） ---
    const weeklyData: { date: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const count = schedules.filter(s => s.load_date === ds).length
      weeklyData.push({ date: `${d.getMonth()+1}/${d.getDate()}`, count })
    }

    return Response.json({
      today: { count: todayCount, drivers: todayDrivers, weight: todayWeight, unassigned: todayUnassigned },
      thisMonth: { count: thisMonthCount, weight: thisMonthWeight, revenue: thisMonthRevenue },
      prevMonth: { count: prevMonthCount, weight: prevMonthWeight, revenue: prevMonthRevenue },
      client_ranking: clientRanking,
      driver_stats: driverList,
      weekly: weeklyData,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
