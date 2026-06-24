import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')
    const clientId = request.nextUrl.searchParams.get('client_id')

    let query = supabase
      .from('dispatches')
      .select('*, driver:drivers(*), client:clients(*), route:routes(*)')
      .in('status', ['confirmed', 'completed'])

    if (dateFrom) query = query.gte('dispatch_date', dateFrom)
    if (dateTo) query = query.lte('dispatch_date', dateTo)
    if (clientId) query = query.eq('client_id', clientId)

    const { data, error } = await query.order('dispatch_date', { ascending: false })

    if (error) throw error

    const clientSummary: Record<string, { client_name: string; total: number; count: number }> = {}
    for (const d of data || []) {
      const cid = d.client_id || 'unknown'
      const cname = d.client?.company_name || '不明'
      if (!clientSummary[cid]) {
        clientSummary[cid] = { client_name: cname, total: 0, count: 0 }
      }
      clientSummary[cid].total += Number(d.calculated_amount) || 0
      clientSummary[cid].count += 1
    }

    return Response.json({
      dispatches: data,
      summary: clientSummary,
      total_amount: (data || []).reduce((sum, d) => sum + (Number(d.calculated_amount) || 0), 0),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
