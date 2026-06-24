import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const clientId = request.nextUrl.searchParams.get('client_id')
    const routeId = request.nextUrl.searchParams.get('route_id')

    let query = supabase
      .from('prices')
      .select('*, client:clients(*), route:routes(*)')
      .eq('is_active', true)

    if (clientId) query = query.eq('client_id', clientId)
    if (routeId) query = query.eq('route_id', routeId)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error
    return Response.json({ prices: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const body = await request.json()

    const { data, error } = await supabase
      .from('prices')
      .insert({
        client_id: body.client_id,
        route_id: body.route_id,
        price_type: body.price_type,
        per_ton_rate: body.per_ton_rate || null,
        fixed_amount: body.fixed_amount || null,
      })
      .select('*, client:clients(*), route:routes(*)')
      .single()

    if (error) throw error
    return Response.json({ price: data }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const body = await request.json()

    const { data, error } = await supabase
      .from('prices')
      .update({
        client_id: body.client_id,
        route_id: body.route_id,
        price_type: body.price_type,
        per_ton_rate: body.per_ton_rate || null,
        fixed_amount: body.fixed_amount || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select('*, client:clients(*), route:routes(*)')
      .single()

    if (error) throw error
    return Response.json({ price: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const { id } = await request.json()

    const { error } = await supabase
      .from('prices')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
