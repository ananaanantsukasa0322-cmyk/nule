import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const body = await request.json()
    const allowed = ['client_name','load_date','load_place','unload_date','unload_place','weight','vehicle_id','driver_id','note','done','load_status','cargo_type','cargo_items','ai_tsumi','ai_tsumi_group','cargo_note','items','slot_index','report_weight']
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (!(key in body)) continue
      let v = body[key]
      if (key === 'vehicle_id' && (!v || v === '')) v = null
      if (key === 'driver_id' && v === '') v = null
      if (key === 'weight' && v != null) v = Number(v) || 0
      if (key === 'slot_index' && v != null) v = Number(v)
      if (key === 'done') v = !!v
      if (key === 'ai_tsumi') v = !!v
      updateData[key] = v
    }
    const { data, error } = await supabase.from('schedules').update(updateData).eq('id', id).select('*').single()
    if (error) throw error
    return Response.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    console.error('schedules PUT error:', e)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const { error } = await supabase.from('schedules').delete().eq('id', id)
    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
