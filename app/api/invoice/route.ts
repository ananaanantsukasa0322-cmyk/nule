import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const clientId = request.nextUrl.searchParams.get('client_id')
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')

    if (!clientId || !dateFrom || !dateTo) {
      return Response.json({ error: '荷主ID・期間を指定してください' }, { status: 400 })
    }

    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (!client) {
      return Response.json({ error: '荷主が見つかりません' }, { status: 404 })
    }

    const { data: dispatches, error } = await supabase
      .from('dispatches')
      .select('*, driver:drivers(*), route:routes(*)')
      .eq('client_id', clientId)
      .gte('dispatch_date', dateFrom)
      .lte('dispatch_date', dateTo)
      .in('status', ['confirmed', 'completed'])
      .order('dispatch_date')

    if (error) throw error

    const totalAmount = (dispatches || []).reduce(
      (sum, d) => sum + (Number(d.calculated_amount) || 0),
      0
    )

    return Response.json({
      client,
      dispatches: dispatches || [],
      total_amount: totalAmount,
      date_from: dateFrom,
      date_to: dateTo,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
