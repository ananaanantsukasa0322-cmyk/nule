import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

const OWNER_EMAIL = 'test@test.com'

export async function GET() {
  try {
    const user = await requireAuth(['admin'])
    if (user.email !== OWNER_EMAIL) return Response.json({ error: '権限がありません' }, { status: 403 })
    const { data, error } = await supabase.from('users').select('id, email, name, role').order('created_at')
    if (error) throw error
    return Response.json({ users: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth(['admin'])
    if (user.email !== OWNER_EMAIL) return Response.json({ error: '権限がありません' }, { status: 403 })
    const { id } = await request.json()
    if (id === user.id) return Response.json({ error: '自分自身は削除できません' }, { status: 400 })
    const { error } = await supabase.from('users').delete().eq('id', id)
    if (error) throw error
    return Response.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
