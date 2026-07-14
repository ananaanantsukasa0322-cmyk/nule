import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
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
