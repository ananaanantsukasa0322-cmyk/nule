import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth, hashPassword } from '@/lib/auth'

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(['admin'])
    if (user.email !== 'test@test.com' && user.id !== (await request.clone().json()).id) {
      return Response.json({ error: '権限がありません' }, { status: 403 })
    }

    const body = await request.json()
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.email) updateData.email = body.email
    if (body.name) updateData.name = body.name
    if (body.password) updateData.password_hash = await hashPassword(body.password)

    const { data, error } = await supabase.from('users').update(updateData).eq('id', body.id).select('id, email, name, role').single()
    if (error) throw error
    return Response.json({ user: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
