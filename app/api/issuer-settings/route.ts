import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const name = request.nextUrl.searchParams.get('issuer_name')
    if (!name) return Response.json({ error: 'issuer_nameが必要です' }, { status: 400 })
    const { data, error } = await supabase
      .from('issuer_settings')
      .select('*')
      .eq('issuer_name', name)
      .maybeSingle()
    if (error) throw error
    return Response.json({ issuer: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e))
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const body = await request.json()
    if (!body.issuer_name?.trim()) return Response.json({ error: 'issuer_nameが必要です' }, { status: 400 })
    const { data, error } = await supabase
      .from('issuer_settings')
      .upsert({
        issuer_name: body.issuer_name.trim(),
        address: body.address || null,
        tel: body.tel || null,
        invoice_no: body.invoice_no || null,
        bank: body.bank || null,
        due_text: body.due_text || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'issuer_name' })
      .select()
      .single()
    if (error) throw error
    return Response.json({ issuer: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : (typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e))
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
