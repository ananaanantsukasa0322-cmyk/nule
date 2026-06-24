import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabase.from('day_off').select('*')
    if (error) {
      if (error.code === '42P01') return Response.json({})
      throw error
    }
    const grouped: Record<string, string[]> = {}
    for (const row of data || []) {
      const date = row.target_date
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(row.driver_id)
    }
    return Response.json(grouped)
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
    const { date, driver_ids } = body as { date: string; driver_ids: string[] }

    await supabase.from('day_off').delete().eq('target_date', date)

    if (driver_ids.length > 0) {
      const rows = driver_ids.map((driver_id) => ({ target_date: date, driver_id }))
      const { error } = await supabase.from('day_off').insert(rows)
      if (error) throw error
    }

    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
