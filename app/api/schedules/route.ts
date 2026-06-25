import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const dateFrom = request.nextUrl.searchParams.get('date_from')
    const dateTo = request.nextUrl.searchParams.get('date_to')
    const done = request.nextUrl.searchParams.get('done')

    let query = supabase.from('schedules').select('*, vehicle:vehicles(*)')

    if (dateFrom) query = query.gte('load_date', dateFrom)
    if (dateTo) query = query.lte('load_date', dateTo)
    if (done === 'true') query = query.eq('done', true)
    if (done === 'false') query = query.eq('done', false)

    const { data, error } = await query.order('load_date', { ascending: false })
    if (error) throw error
    return Response.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const allowed = ['client_name','load_date','load_place','unload_date','unload_place','weight','vehicle_id','driver_id','note','done','load_status','cargo_type','cargo_items','ai_tsumi','ai_tsumi_group','cargo_note','items','slot_index']

    function clean(obj: Record<string, unknown>) {
      const out: Record<string, unknown> = {}
      for (const k of allowed) { if (k in obj) { let v = obj[k]; if (k === 'vehicle_id' && (!v || v === '')) v = null; out[k] = v; } }
      return out
    }

    if (Array.isArray(body)) {
      const cleaned = body.map(clean)
      const { data, error } = await supabase.from('schedules').insert(cleaned).select('*')
      if (error) throw error
      return Response.json(data, { status: 201 })
    }

    const { data, error } = await supabase.from('schedules').insert(clean(body)).select('*').single()
    if (error) throw error
    return Response.json(data, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    console.error('schedules POST error:', e)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const id = body.id
    const allowed = ['client_name','load_date','load_place','unload_date','unload_place','weight','vehicle_id','driver_id','note','done','load_status','cargo_type','cargo_items','ai_tsumi','ai_tsumi_group','cargo_note','items','slot_index']
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) { if (key in body) { let v = body[key]; if (key === 'vehicle_id' && (!v || v === '')) v = null; updateData[key] = v; } }
    const { data, error } = await supabase.from('schedules').update(updateData).eq('id', id).select('*').single()
    if (error) throw error
    return Response.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth()
    const { id } = await request.json()
    const { error } = await supabase.from('schedules').delete().eq('id', id)
    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
