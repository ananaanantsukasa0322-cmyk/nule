import { createClient } from '@supabase/supabase-js'

const EXISTING_API = 'http://localhost:5001/api'
const SUPABASE_URL = 'https://sboudgqqipcdynplkwqq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3VkZ3FxaXBjZHlucGxrd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTc3NDYsImV4cCI6MjA5Nzg3Mzc0Nn0.xbDxJp6NoJAibTQRm2e3taciJ7NXwNTCsiF-QSwzXJE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchExisting(endpoint: string) {
  const res = await fetch(`${EXISTING_API}/${endpoint}`)
  return res.json()
}

async function resync() {
  console.log('=== 最新データ完全再同期 ===')

  const [existingDrivers, existingVehicles, existingSchedules, existingPlaces, existingYoushas, existingLoadPlaces] = await Promise.all([
    fetchExisting('drivers'),
    fetchExisting('vehicles'),
    fetchExisting('schedules'),
    fetchExisting('places'),
    fetchExisting('youshas'),
    fetchExisting('load_places'),
  ])

  console.log(`既存データ: ドライバー${existingDrivers.length} 車両${existingVehicles.length} スケジュール${existingSchedules.length} 場所${existingPlaces.length} 傭車${existingYoushas.length} 積み地${existingLoadPlaces.length}`)

  // 1. 既存データクリア
  console.log('\n--- データクリア ---')
  await supabase.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('vehicles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('youshas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('places').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('  完了')

  // 2. 車両移行
  console.log('\n--- 車両移行 ---')
  const vehicleIdMap: Record<string, string> = {}
  for (const v of existingVehicles) {
    const { data, error } = await supabase.from('vehicles').insert({
      kind: v.kind, number: v.number || '', head_number: v.head_number || '',
      trailer_number: v.trailer_number || '', payload: Number(v.payload) || 0, note: v.note || '',
    }).select('id').single()
    if (error) { console.error(`  ✗ ${v.id}: ${error.message}`); continue }
    vehicleIdMap[String(v.id)] = data.id
  }
  console.log(`  ${Object.keys(vehicleIdMap).length}台`)

  // 3. ドライバーIDマッピング + 情報更新
  console.log('\n--- ドライバー更新 ---')
  const { data: nuleDrivers } = await supabase.from('drivers').select('id, name').eq('is_active', true)
  const driverIdMap: Record<string, string> = {}
  for (const ed of existingDrivers) {
    const nd = (nuleDrivers || []).find(d => d.name.trim() === ed.name.trim())
    if (!nd) { console.log(`  ? ${ed.name} not found`); continue }
    driverIdMap[String(ed.id)] = nd.id
    const defVeh = ed.default_vehicle_id ? vehicleIdMap[String(ed.default_vehicle_id)] : null
    await supabase.from('drivers').update({
      phone: ed.phone || null, status: ed.status || '稼働中',
      haisha_visible: ed.haisha_visible !== false,
      display_order: ed.display_order || 0, default_vehicle_id: defVeh,
    }).eq('id', nd.id)
  }
  console.log(`  ${Object.keys(driverIdMap).length}名`)

  // 4. 傭車移行
  console.log('\n--- 傭車移行 ---')
  const youshaIdMap: Record<string, string> = {}
  for (const y of existingYoushas) {
    const { data, error } = await supabase.from('youshas').insert({
      name: y.name, display_name: y.display_name || '',
      company: '', phone: '', vehicle_info: y.vehicle_number || '',
      payment_rate: 0, note: y.payload ? `最大積載量${y.payload}kg` : '',
    }).select('id').single()
    if (error) { console.error(`  ✗ ${y.name}: ${error.message}`); continue }
    youshaIdMap[String(y.id)] = data.id
    console.log(`  ✓ ${y.name} (old:${y.id} → new:y_${data.id})`)
  }

  // 5. 場所移行
  console.log('\n--- 場所移行 ---')
  for (const p of existingPlaces) {
    await supabase.from('places').insert({ name: p.name, caution: p.caution || null, place_type: 'unload' })
  }
  for (const p of existingLoadPlaces) {
    await supabase.from('places').insert({ name: p.name, place_type: 'load' })
  }
  console.log(`  ${existingPlaces.length + existingLoadPlaces.length}件`)

  // 6. スケジュール移行（傭車y_プレフィックス対応）
  console.log('\n--- スケジュール移行 ---')
  let ok = 0, ng = 0
  for (const s of existingSchedules) {
    let driverId: string | null = null
    const did = String(s.driver_id || '')

    if (did.startsWith('y_')) {
      const oldYId = did.slice(2)
      if (youshaIdMap[oldYId]) {
        driverId = `y_${youshaIdMap[oldYId]}`
      }
    } else if (did && driverIdMap[did]) {
      driverId = driverIdMap[did]
    }

    const vehicleId = s.vehicle_id ? vehicleIdMap[String(s.vehicle_id)] || null : null

    const { error } = await supabase.from('schedules').insert({
      load_date: s.load_date || null, load_place: s.load_place || '',
      unload_date: s.unload_date || null, unload_place: s.unload_place || '',
      weight: Number(s.weight) || 0,
      driver_id: driverId,
      vehicle_id: vehicleId,
      note: s.note || '', done: !!s.done,
      load_status: s.load_status || 'none',
      cargo_type: s.cargo_type || null, cargo_items: s.cargo_items || null,
    })
    if (error) { console.error(`  ✗ #${s.id}: ${error.message}`); ng++; continue }
    ok++
  }
  console.log(`  ${ok}件成功, ${ng}件エラー`)

  console.log('\n=== 再同期完了 ===')
}

resync().catch(console.error)
