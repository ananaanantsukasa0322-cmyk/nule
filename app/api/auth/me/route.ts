import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  // getCurrentUser()はセッションCookie無し・DB照会失敗のどちらもnullに丸めてしまい、
  // クライアント側で「本当に未ログイン」と「一時的な通信/DBエラー」を区別できない。
  // ここではAuthGuardのリトライ判定用に、その2つを別ステータスで返す。
  const cookieStore = await cookies()
  const session = cookieStore.get('nule-session')
  if (!session?.value) {
    return Response.json({ error: '未認証' }, { status: 401 })
  }
  const [userId] = session.value.split(':')
  if (!userId) {
    return Response.json({ error: '未認証' }, { status: 401 })
  }

  let user
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, created_at, updated_at')
      .eq('id', userId)
      .single()
    if (error) throw error
    user = data
  } catch {
    // Cookieはあるが照会に失敗＝一時的なエラーの可能性が高いので401にしない（AuthGuardがリトライする）
    return Response.json({ error: '確認できませんでした' }, { status: 503 })
  }
  if (!user) {
    return Response.json({ error: '未認証' }, { status: 401 })
  }

  // アクセスがある限りセッションを自動延長（スライド式・7日）
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('nule-session')
    if (session?.value) {
      cookieStore.set('nule-session', session.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      })
    }
  } catch { /* 延長失敗は致命的ではない */ }

  return Response.json({ user })
}
