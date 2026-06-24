import { createClient } from '@supabase/supabase-js'

const EXISTING_API = 'http://localhost:5001/api'
const SUPABASE_URL = 'https://sboudgqqipcdynplkwqq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3VkZ3FxaXBjZHlucGxrd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTc3NDYsImV4cCI6MjA5Nzg3Mzc0Nn0.xbDxJp6NoJAibTQRm2e3taciJ7NXwNTCsiF-QSwzXJE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchE(ep: string) { return fetch(`${EXISTING_API}/${ep}`).then(r => r.json()) }

async function main() {
  const [eDr, eVe, eSc, ePl, eYo, eLp] = await Promise.all([
    fetchE('drivers'), fetchE('vehicles'), fetchE('schedules'),
    fetchE('places'), fetchE('youshas'), fetchE('load_places'),
  ])
  console.log(`既存: drivers=${eDr.length} vehicles=${eVe.length} schedules=${eSc.length} places=${ePl.length} youshas=${eYo.length} load_places=${eLp.length}`)

  // Save client_name mapping before clearing
  const { data: existingScheds } = await supabase.from('schedules').select('load_place,unload_place,client_name').not('client_name', 'is', null)
  const clientMap: Record<string, string> = {}
  for (const s of existingScheds || []) {
    if (s.client_name) clientMap[`${s.load_place}|||${s.unload_place}`] = s.client_name
  }
  console.log(`保存済み荷主マッピング: ${Object.keys(clientMap).length}件`)

  // Clear
  await supabase.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('vehicles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('youshas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('places').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Vehicles
  const vMap: Record<string, string> = {}
  for (const v of eVe) {
    const { data } = await supabase.from('vehicles').insert({
      kind: v.kind, number: v.number || '', head_number: v.head_number || '',
      trailer_number: v.trailer_number || '', payload: Number(v.payload) || 0, note: v.note || '',
    }).select('id').single()
    if (data) vMap[String(v.id)] = data.id
  }
  console.log(`vehicles: ${Object.keys(vMap).length}`)

  // Drivers mapping
  const { data: nd } = await supabase.from('drivers').select('id, name').eq('is_active', true)
  const dMap: Record<string, string> = {}
  for (const ed of eDr) {
    const n = (nd || []).find(d => d.name.trim() === ed.name.trim())
    if (!n) continue
    dMap[String(ed.id)] = n.id
    await supabase.from('drivers').update({
      phone: ed.phone || null, status: ed.status || '稼働中',
      haisha_visible: ed.haisha_visible !== false,
      display_order: ed.display_order || 0,
      default_vehicle_id: ed.default_vehicle_id ? vMap[String(ed.default_vehicle_id)] || null : null,
    }).eq('id', n.id)
  }
  console.log(`drivers: ${Object.keys(dMap).length}`)

  // Youshas
  const yMap: Record<string, string> = {}
  for (const y of eYo) {
    const { data } = await supabase.from('youshas').insert({
      name: y.name, display_name: y.display_name || '',
      company: '', phone: '', vehicle_info: y.vehicle_number || '',
      payment_rate: 0, payload: y.payload || '', note: y.payload ? `最大積載量${y.payload}kg` : '',
    }).select('id').single()
    if (data) { yMap[String(y.id)] = data.id; console.log(`yousha: ${y.name} → y_${data.id}`) }
  }

  // Places
  for (const p of ePl) await supabase.from('places').insert({ name: p.name, caution: p.caution || null, place_type: 'unload' })
  for (const p of eLp) await supabase.from('places').insert({ name: p.name, place_type: 'load' })

  // Schedules (ALL fields including ai_tsumi, cargo_note, items, slot_index)
  let ok = 0, ng = 0
  for (const s of eSc) {
    let driver_id: string | null = null
    const did = String(s.driver_id || '')
    if (did.startsWith('y_')) {
      const oldYId = did.slice(2)
      if (yMap[oldYId]) driver_id = `y_${yMap[oldYId]}`
    } else if (did && dMap[did]) {
      driver_id = dMap[did]
    }

    const vehicle_id = s.vehicle_id ? vMap[String(s.vehicle_id)] || null : null

    const { error } = await supabase.from('schedules').insert({
      load_date: s.load_date || null,
      load_place: s.load_place || '',
      unload_date: s.unload_date || null,
      unload_place: s.unload_place || '',
      weight: Number(s.weight) || 0,
      driver_id,
      vehicle_id,
      note: s.note || '',
      done: !!s.done,
      load_status: s.load_status || 'none',
      cargo_type: s.cargo_type || null,
      cargo_items: s.cargo_items || null,
      ai_tsumi: !!s.ai_tsumi,
      ai_tsumi_group: s.ai_tsumi_group || null,
      cargo_note: s.cargo_note || null,
      items: s.items || null,
      slot_index: s.slot_index != null ? Number(s.slot_index) : null,
      client_name: clientMap[`${s.load_place || ''}|||${s.unload_place || ''}`] || null,
    })
    if (error) { ng++; if (ng <= 3) console.error(`  ✗ #${s.id}: ${error.message}`) } else ok++
  }
  console.log(`schedules: ${ok}成功, ${ng}エラー`)
  console.log('完了')
}
main().catch(console.error)
