import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, createSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return Response.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('email', email)
      .eq('password_hash', passwordHash)
      .single()

    if (error || !user) {
      return Response.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 })
    }

    await createSession(user.id)

    return Response.json({ user })
  } catch {
    return Response.json({ error: 'ログインに失敗しました' }, { status: 500 })
  }
}
