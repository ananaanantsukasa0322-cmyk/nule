import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// 非表示化された場所（place_type = hidden_load / hidden_unload）の一覧
export async function GET() {
  try {
    await requireAuth()
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .in('place_type', ['hidden_load', 'hidden_unload'])
      .order('name')
    if (error) throw error
    return Response.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
