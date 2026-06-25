import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabase.from('spot_visible').select('*')
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

    if (body.driver_id && body.date) {
      const { error } = await supabase.from('spot_visible').upsert(
        { target_date: body.date, driver_id: body.driver_id },
        { onConflict: 'target_date,driver_id' }
      )
      if (error) {
        await supabase.from('spot_visible').insert({ target_date: body.date, driver_id: body.driver_id })
      }
      return Response.json({ success: true })
    }

    const { date, driver_ids } = body as { date: string; driver_ids: string[] }
    await supabase.from('spot_visible').delete().eq('target_date', date)
    if (driver_ids && driver_ids.length > 0) {
      const rows = driver_ids.map((driver_id: string) => ({ target_date: date, driver_id }))
      const { error } = await supabase.from('spot_visible').insert(rows)
      if (error) throw error
    }
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    console.error('spot_visible POST error:', e)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    if (body.driver_id && body.date) {
      await supabase.from('spot_visible').delete()
        .eq('target_date', body.date).eq('driver_id', body.driver_id)
    }
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
