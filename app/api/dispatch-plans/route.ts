import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const planDate = request.nextUrl.searchParams.get('plan_date')

    let query = supabase.from('dispatch_plans').select('*')
    if (planDate) query = query.eq('plan_date', planDate)

    const { data, error } = await query.order('created_at', { ascending: false })
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
    const { data, error } = await supabase.from('dispatch_plans').insert(body).select().single()
    if (error) throw error
    return Response.json(data, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
