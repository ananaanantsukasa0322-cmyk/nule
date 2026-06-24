import { supabase } from './supabase'

export async function buildDriverNameMap(): Promise<Record<string, string>> {
  const [{ data: drivers }, { data: youshas }] = await Promise.all([
    supabase.from('drivers').select('id, name').eq('is_active', true),
    supabase.from('youshas').select('id, name, display_name'),
  ])
  const map: Record<string, string> = {}
  for (const d of drivers || []) map[d.id] = d.name
  for (const y of youshas || []) map[`y_${y.id}`] = y.display_name || y.name
  return map
}
