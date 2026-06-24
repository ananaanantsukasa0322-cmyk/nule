import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('is_active', true)
      .order('name')

    if (error) throw error
    return Response.json({ drivers: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const body = await request.json()

    const { data, error } = await supabase
      .from('drivers')
      .insert({
        name: body.name,
        payment_percentage: body.payment_percentage,
      })
      .select()
      .single()

    if (error) throw error
    return Response.json({ driver: data }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const body = await request.json()

    const { data, error } = await supabase
      .from('drivers')
      .update({
        name: body.name,
        payment_percentage: body.payment_percentage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select()
      .single()

    if (error) throw error
    return Response.json({ driver: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const { id } = await request.json()

    const { error } = await supabase
      .from('drivers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
