import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { buildDriverNameMap } from '@/lib/resolve-drivers'

const JST_OFFSET = 9 * 60 * 60 * 1000

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export async function GET() {
  try {
    await requireAuth(['admin', 'office'])

    // Vercel(UTC)でも日本時間の「今日」を基準にする
    const nowJst = new Date(Date.now() + JST_OFFSET)
    const y = nowJst.getUTCFullYear()
    const mo = nowJst.getUTCMonth()

    const today = ymd(nowJst)
    const firstDay = ymd(new Date(Date.UTC(y, mo, 1)))
    const lastDay = ymd(new Date(Date.UTC(y, mo + 1, 0)))
    const sixMonthsAgoFirst = ymd(new Date(Date.UTC(y, mo - 5, 1)))

    // スケジュールは直近6ヶ月分を1クエリで取得し、集計はすべてメモリ上で行う
    const [schedulesRes, pricesRes] = await Promise.all([
      supabase.from('schedules')
        .select('unload_date,client_name,load_place,unload_place,weight,driver_id,manual_amount')
        .gte('unload_date', sixMonthsAgoFirst)
        .lte('unload_date', lastDay),
      supabase.from('prices').select('client_name,load_place,unload_place,price_type,per_ton_rate,fixed_amount,vehicle_type').eq('is_active', true),
    ])

    const allSchedules = schedulesRes.data || []
    const prices = pricesRes.data || []
    const driverMap = await buildDriverNameMap()

    const schedules = allSchedules.filter(s => s.unload_date >= firstDay && s.unload_date <= lastDay)
    const prevFirstDay = ymd(new Date(Date.UTC(y, mo - 1, 1)))
    const prevLastDay = ymd(new Date(Date.UTC(y, mo, 0)))
    const prevSchedules = allSchedules.filter(s => s.unload_date >= prevFirstDay && s.unload_date <= prevLastDay)
    const todaySchedules = allSchedules.filter(s => s.unload_date === today)

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

    function matchPlace(pp: string, sp: string): boolean {
      if (!pp || !sp) return !pp
      if (pp === sp) return true
      if (sp.includes(pp) || pp.includes(sp)) return true
      return false
    }

    // 同一 荷主×積み地×下ろし先×車両タイプ の単価検索をキャッシュ
    const priceCache = new Map<string, typeof prices[0] | undefined>()
    function findPrice(s: { client_name?: string; load_place?: string; unload_place?: string; weight?: number }) {
      const vt = (s.weight || 0) >= 15000 ? 'トレーラー' : '大型'
      const key = `${s.client_name || ''}|${s.load_place || ''}|${s.unload_place || ''}|${vt}`
      if (priceCache.has(key)) return priceCache.get(key)
      function search(matchFn: (p: typeof prices[0]) => boolean) {
        return prices.find(p => matchFn(p) && p.vehicle_type === vt)
          || prices.find(p => matchFn(p) && !p.vehicle_type)
      }
      let p = search(p => p.client_name === s.client_name && p.load_place === s.load_place && p.unload_place === s.unload_place)
      if (!p) p = search(p => p.client_name === s.client_name && matchPlace(p.load_place, s.load_place || '') && matchPlace(p.unload_place, s.unload_place || ''))
      if (!p) p = search(p => p.client_name === s.client_name && !p.load_place && !p.unload_place)
      priceCache.set(key, p)
      return p
    }

    function calcAmount(s: { weight?: number; manual_amount?: number }, p: typeof prices[0] | undefined) {
      if ((s.manual_amount ?? 0) > 0) return s.manual_amount!
      if (!p) return 0
      if (p.price_type === 'per_ton' && p.per_ton_rate) return Math.round(p.per_ton_rate * (s.weight || 0) / 1000)
      if (p.fixed_amount) return p.fixed_amount
      return 0
    }

    function calcRevenue(scheds: typeof allSchedules) {
      return scheds.reduce((sum, s) => sum + calcAmount(s, findPrice(s)), 0)
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
      clientRevenue[cn].revenue += calcAmount(s, findPrice(s))
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
    const weeklyData: { date: string; day: string; count: number }[] = []
    const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowJst.getTime() - i * 24 * 60 * 60 * 1000)
      const ds = ymd(d)
      const count = allSchedules.filter(s => s.unload_date === ds).length
      weeklyData.push({ date: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, day: DAY_LABELS[d.getUTCDay()], count })
    }

    // --- 月次推移（直近6ヶ月の売上・件数） ---
    const monthlyData: { month: string; count: number; revenue: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const mFirst = ymd(new Date(Date.UTC(y, mo - i, 1)))
      const mLast = ymd(new Date(Date.UTC(y, mo - i + 1, 0)))
      const ms = allSchedules.filter(s => s.unload_date >= mFirst && s.unload_date <= mLast)
      const mDate = new Date(Date.UTC(y, mo - i, 1))
      monthlyData.push({
        month: `${mDate.getUTCMonth() + 1}月`,
        count: ms.length,
        revenue: calcRevenue(ms),
      })
    }

    return Response.json({
      today: { count: todayCount, drivers: todayDrivers, weight: todayWeight, unassigned: todayUnassigned },
      thisMonth: { count: thisMonthCount, weight: thisMonthWeight, revenue: thisMonthRevenue },
      prevMonth: { count: prevMonthCount, weight: prevMonthWeight, revenue: prevMonthRevenue },
      client_ranking: clientRanking,
      driver_stats: driverList,
      weekly: weeklyData,
      monthly: monthlyData,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
