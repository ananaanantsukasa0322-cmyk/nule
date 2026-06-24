import { cookies } from 'next/headers'
import { supabase } from './supabase'
import type { User, UserRole } from '@/types/database'

const SESSION_COOKIE = 'nule-session'

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
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get(SESSION_COOKIE)
    if (!session?.value) return null

    const [userId] = session.value.split(':')
    if (!userId) return null

    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, created_at, updated_at')
      .eq('id', userId)
      .single()

    if (error || !data) return null
    return data as User
  } catch {
    return null
  }
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
  cookieStore.delete(SESSION_COOKIE)
}
