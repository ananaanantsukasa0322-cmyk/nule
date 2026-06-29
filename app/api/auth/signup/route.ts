import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, createSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { getCurrentUser } = await import('@/lib/auth')
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.email !== 'test@test.com') {
      return Response.json({ error: 'オーナーのみユーザー作成可能です' }, { status: 403 })
    }

    const { email, password, name, role } = await request.json()

    if (!email || !password || !name) {
      return Response.json({ error: '全ての項目を入力してください' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        name,
        role: role || 'dispatcher',
      })
      .select('id, email, name, role')
      .single()

    if (error) {
      console.error('Signup DB error:', JSON.stringify(error))
      if (error.code === '23505') {
        return Response.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 })
      }
      return Response.json({ error: '登録に失敗しました: ' + error.message }, { status: 500 })
    }

    return Response.json({ user })
  } catch {
    return Response.json({ error: '登録に失敗しました' }, { status: 500 })
  }
}
