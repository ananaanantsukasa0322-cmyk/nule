import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(['admin'])
    if (user.email !== 'test@test.com') {
      return Response.json({ error: 'オーナーのみ招待可能です' }, { status: 403 })
    }

    const { email, name, role } = await request.json()
    if (!email) return Response.json({ error: 'メールアドレスは必須です' }, { status: 400 })

    const token = crypto.randomUUID()

    const { data, error } = await supabase.from('users').insert({
      email,
      name: name || email.split('@')[0],
      role: role || 'dispatcher',
      password_hash: '',
      invite_token: token,
    }).select('id, email, name, role, invite_token').single()

    if (error) {
      if (error.code === '23505') return Response.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 })
      throw error
    }

    const baseUrl = request.headers.get('origin') || 'https://nule-seven.vercel.app'
    const inviteUrl = `${baseUrl}/setup-password?token=${token}`

    return Response.json({ user: data, invite_url: inviteUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
