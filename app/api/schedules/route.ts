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

    if (Array.isArray(body)) {
      const { data, error } = await supabase.from('schedules').insert(body).select('*, driver:drivers(*), vehicle:vehicles(*)')
      if (error) throw error
      return Response.json(data, { status: 201 })
    }

    const { data, error } = await supabase.from('schedules').insert(body).select('*, driver:drivers(*), vehicle:vehicles(*)').single()
    if (error) throw error
    return Response.json(data, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const { id, vehicle, driver, created_at, ...rest } = body
    void vehicle; void driver; void created_at
    rest.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('schedules').update(rest).eq('id', id).select('*').single()
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
