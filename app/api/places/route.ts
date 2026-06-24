import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabase.from('places').select('*').order('name')
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
    const { data, error } = await supabase.from('places').insert(body).select().single()
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
    const { id, ...rest } = body
    const { data, error } = await supabase.from('places').update(rest).eq('id', id).select().single()
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
    const { error } = await supabase.from('places').delete().eq('id', id)
    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
