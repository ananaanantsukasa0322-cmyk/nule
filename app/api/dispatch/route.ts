import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')
    const driverId = request.nextUrl.searchParams.get('driver_id')
    const clientId = request.nextUrl.searchParams.get('client_id')

    let query = supabase
      .from('dispatches')
      .select('*, driver:drivers(*), client:clients(*), route:routes(*), price:prices(*)')

    if (dateFrom) query = query.gte('dispatch_date', dateFrom)
    if (dateTo) query = query.lte('dispatch_date', dateTo)
    if (driverId) query = query.eq('driver_id', driverId)
    if (clientId) query = query.eq('client_id', clientId)

    const { data, error } = await query.order('dispatch_date', { ascending: false })

    if (error) throw error
    return Response.json({ dispatches: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()

    let calculatedAmount = 0

    if (body.price_type === 'spot') {
      calculatedAmount = Number(body.spot_amount) || 0
    } else if (body.price_type === 'fixed' && body.price_id) {
      const { data: price } = await supabase
        .from('prices')
        .select('fixed_amount')
        .eq('id', body.price_id)
        .single()
      calculatedAmount = Number(price?.fixed_amount) || 0
    } else if (body.price_type === 'per_ton' && body.price_id) {
      const { data: price } = await supabase
        .from('prices')
        .select('per_ton_rate')
        .eq('id', body.price_id)
        .single()
      calculatedAmount = (Number(price?.per_ton_rate) || 0) * (Number(body.weight) || 0)
    }

    const { data, error } = await supabase
      .from('dispatches')
      .insert({
        dispatch_date: body.dispatch_date,
        driver_id: body.driver_id,
        client_id: body.client_id,
        route_id: body.route_id,
        price_id: body.price_id || null,
        loading_place: body.loading_place || null,
        unloading_place: body.unloading_place || null,
        weight: body.weight || null,
        price_type: body.price_type,
        spot_amount: body.spot_amount || null,
        calculated_amount: calculatedAmount,
        created_by: user.id,
      })
      .select('*, driver:drivers(*), client:clients(*), route:routes(*)')
      .single()

    if (error) throw error
    return Response.json({ dispatch: data }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()

    let calculatedAmount = body.calculated_amount

    if (body.price_type === 'spot') {
      calculatedAmount = Number(body.spot_amount) || 0
    } else if (body.price_type === 'fixed' && body.price_id) {
      const { data: price } = await supabase
        .from('prices')
        .select('fixed_amount')
        .eq('id', body.price_id)
        .single()
      calculatedAmount = Number(price?.fixed_amount) || 0
    } else if (body.price_type === 'per_ton' && body.price_id) {
      const { data: price } = await supabase
        .from('prices')
        .select('per_ton_rate')
        .eq('id', body.price_id)
        .single()
      calculatedAmount = (Number(price?.per_ton_rate) || 0) * (Number(body.weight) || 0)
    }

    const { data, error } = await supabase
      .from('dispatches')
      .update({
        dispatch_date: body.dispatch_date,
        driver_id: body.driver_id,
        client_id: body.client_id,
        route_id: body.route_id,
        price_id: body.price_id || null,
        loading_place: body.loading_place,
        unloading_place: body.unloading_place,
        weight: body.weight,
        price_type: body.price_type,
        spot_amount: body.spot_amount || null,
        calculated_amount: calculatedAmount,
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select('*, driver:drivers(*), client:clients(*), route:routes(*)')
      .single()

    if (error) throw error
    return Response.json({ dispatch: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const { id } = await request.json()

    const { error } = await supabase.from('dispatches').delete().eq('id', id)

    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
