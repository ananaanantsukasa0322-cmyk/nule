import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, createSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return Response.json({ error: 'トークンとパスワードは必須です' }, { status: 400 })
    }
    if (password.length < 4) {
      return Response.json({ error: 'パスワードは4文字以上で設定してください' }, { status: 400 })
    }

    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('invite_token', token)
      .single()

    if (findError || !user) {
      return Response.json({ error: '無効または期限切れの招待リンクです' }, { status: 404 })
    }

    const passwordHash = await hashPassword(password)

    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, invite_token: null })
      .eq('id', user.id)

    if (updateError) throw updateError

    await createSession(user.id)

    return Response.json({ user })
  } catch {
    return Response.json({ error: 'パスワード設定に失敗しました' }, { status: 500 })
  }
}
