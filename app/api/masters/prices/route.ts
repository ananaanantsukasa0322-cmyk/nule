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

// 相積み（複数積み地→1件で合計金額）用のマッチングキー：積み地集合を正規化して連結
function comboKey(loadPlaces: string[]): string {
  return [...new Set(loadPlaces.map((p) => (p || '').trim()).filter(Boolean))].sort().join('|')
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const body = await request.json()

    if (body.price_type === 'combo') {
      const loadKey = comboKey(Array.isArray(body.load_places) ? body.load_places : [])
      const unloadKey = comboKey(Array.isArray(body.unload_places) ? body.unload_places : (body.unload_place ? [body.unload_place] : []))
      if (!loadKey || !unloadKey || !body.client_name) {
        return Response.json({ error: '荷主・積み地・下ろし先が必要です（どちらかは2件以上）' }, { status: 400 })
      }
      const { data, error } = await supabase.from('prices').insert({
        client_name: body.client_name,
        load_place: loadKey,
        unload_place: unloadKey,
        price_type: 'combo',
        per_ton_rate: body.per_ton_rate || null,
        fixed_amount: body.fixed_amount || null,
        vehicle_type: null,
        is_active: true,
      }).select()
      if (error) throw error
      const { data: existingClient } = await supabase.from('clients').select('id').eq('company_name', body.client_name).maybeSingle()
      if (!existingClient) await supabase.from('clients').insert({ company_name: body.client_name })
      return Response.json({ price: data }, { status: 201 })
    }

    const unloadPlaces = (body.unload_place || '').split(/[・／]/).map((s: string) => s.trim()).filter(Boolean)
    const loadPlaces = (body.load_place || '').split(/[・／]/).map((s: string) => s.trim()).filter(Boolean)
    if (!unloadPlaces.length) unloadPlaces.push(body.unload_place || '')
    if (!loadPlaces.length) loadPlaces.push(body.load_place || '')

    const rows = []
    for (const lp of loadPlaces) {
      for (const up of unloadPlaces) {
        rows.push({
          client_name: body.client_name || null,
          load_place: lp || null,
          unload_place: up || null,
          price_type: body.price_type,
          per_ton_rate: body.per_ton_rate || null,
          fixed_amount: body.fixed_amount || null,
          vehicle_type: body.vehicle_type || null,
          is_active: true,
        })
      }
    }

    const { data, error } = await supabase.from('prices').insert(rows).select()
    if (error) throw error

    // 荷主マスタに自動登録（未登録の場合のみ）
    if (body.client_name) {
      const { data: existingClient } = await supabase.from('clients').select('id').eq('company_name', body.client_name).maybeSingle()
      if (!existingClient) await supabase.from('clients').insert({ company_name: body.client_name })
    }

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
    if (body.price_type === 'combo' && Array.isArray(body.load_places)) {
      updateData.load_place = comboKey(body.load_places) || null
    } else if ('load_place' in body) updateData.load_place = body.load_place || null
    if (body.price_type === 'combo' && Array.isArray(body.unload_places)) {
      updateData.unload_place = comboKey(body.unload_places) || null
    } else if ('unload_place' in body) updateData.unload_place = body.unload_place || null
    if ('price_type' in body) updateData.price_type = body.price_type
    if ('per_ton_rate' in body) updateData.per_ton_rate = body.per_ton_rate || null
    if ('fixed_amount' in body) updateData.fixed_amount = body.fixed_amount || null
    if ('vehicle_type' in body) updateData.vehicle_type = body.vehicle_type || null
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
