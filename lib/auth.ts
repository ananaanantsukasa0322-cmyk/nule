import { cookies } from 'next/headers'
import { supabase } from './supabase'
import type { User, UserRole } from '@/types/database'

const SESSION_COOKIE = 'nule-session'

// 1ページの表示で複数のAPIが同時に呼ばれるたびに毎回DBへユーザー確認しに行くと
// 無駄に遅くなるため、同じセッションの確認結果を短時間だけ使い回す
const USER_CACHE_TTL_MS = 15_000
const userCache = new Map<string, { user: User | null; expiresAt: number }>()

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + (process.env.JWT_SECRET || ''))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, `${userId}:${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return token
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  if (!session?.value) return null

  const [userId] = session.value.split(':')
  if (!userId) return null

  const cached = userCache.get(session.value)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user
  }

  // DB照会の一時的な失敗（コネクション瞬断など）を「未ログイン」と誤判定して
  // 全APIが401を返し、強制ログアウトにつながらないよう1回だけリトライする
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, created_at, updated_at')
        .eq('id', userId)
        .single()
      if (error) throw error
      const user = (data as User) || null
      userCache.set(session.value, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS })
      return user
    } catch {
      if (attempt === 0) continue
      return null
    }
  }
  return null
}

export async function requireAuth(allowedRoles?: UserRole[]): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error('FORBIDDEN')
  }
  return user
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  if (session?.value) userCache.delete(session.value)
  cookieStore.delete(SESSION_COOKIE)
}
