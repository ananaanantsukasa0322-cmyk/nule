import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabase.from('prices').select('*').eq('is_active', true).order('client_name')
    if (error) throw error
    return Response.json({ prices: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const body = await request.json()
    const { data, error } = await supabase.from('prices').insert({
      client_name: body.client_name || null,
      load_place: body.load_place || null,
      unload_place: body.unload_place || null,
      price_type: body.price_type,
      per_ton_rate: body.per_ton_rate || null,
      fixed_amount: body.fixed_amount || null,
    }).select().single()
    if (error) throw error
    return Response.json({ price: data }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const body = await request.json()
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('client_name' in body) updateData.client_name = body.client_name || null
    if ('load_place' in body) updateData.load_place = body.load_place || null
    if ('unload_place' in body) updateData.unload_place = body.unload_place || null
    if ('price_type' in body) updateData.price_type = body.price_type
    if ('per_ton_rate' in body) updateData.per_ton_rate = body.per_ton_rate || null
    if ('fixed_amount' in body) updateData.fixed_amount = body.fixed_amount || null
    const { data, error } = await supabase.from('prices').update(updateData).eq('id', body.id).select().single()
    if (error) throw error
    return Response.json({ price: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const { id } = await request.json()
    const { error } = await supabase.from('prices').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
