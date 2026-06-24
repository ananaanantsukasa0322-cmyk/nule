import { createClient } from '@supabase/supabase-js'

const EXISTING_API = 'http://localhost:5001/api'
const SUPABASE_URL = 'https://sboudgqqipcdynplkwqq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3VkZ3FxaXBjZHlucGxrd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTc3NDYsImV4cCI6MjA5Nzg3Mzc0Nn0.xbDxJp6NoJAibTQRm2e3taciJ7NXwNTCsiF-QSwzXJE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchExisting(endpoint: string) {
  const res = await fetch(`${EXISTING_API}/${endpoint}`)
  return res.json()
}

async function migrate() {
  console.log('=== 既存データを新テーブルに移行 ===')

  const [existingDrivers, existingVehicles, existingSchedules, existingPlaces] = await Promise.all([
    fetchExisting('drivers'),
    fetchExisting('vehicles'),
    fetchExisting('schedules'),
    fetchExisting('places'),
  ])

  // 1. 車両移行
  console.log('\n--- 車両移行 ---')
  const vehicleIdMap: Record<string, string> = {}
  for (const v of existingVehicles) {
    const { data, error } = await supabase.from('vehicles').insert({
      kind: v.kind,
      number: v.number || '',
      head_number: v.head_number || '',
      trailer_number: v.trailer_number || '',
      payload: Number(v.payload) || 0,
      note: v.note || '',
    }).select('id').single()
    if (error) { console.error(`  ✗ ${v.id}: ${error.message}`); continue }
    vehicleIdMap[String(v.id)] = data.id
    console.log(`  ✓ ${v.kind} ${v.number || v.head_number}`)
  }

  // 2. ドライバーのphone/status/haisha_visible更新
  console.log('\n--- ドライバー情報更新 ---')
  const { data: nuleDrivers } = await supabase.from('drivers').select('id, name').eq('is_active', true)
  const driverIdMap: Record<string, string> = {}
  for (const ed of existingDrivers) {
    const nd = (nuleDrivers || []).find(d => d.name.trim() === ed.name.trim())
    if (!nd) { console.log(`  ? ${ed.name} not found`); continue }
    driverIdMap[String(ed.id)] = nd.id
    const defaultVehicle = ed.default_vehicle_id ? vehicleIdMap[String(ed.default_vehicle_id)] : null
    await supabase.from('drivers').update({
      phone: ed.phone || null,
      status: ed.status || '稼働中',
      haisha_visible: ed.haisha_visible !== false,
      display_order: ed.display_order || 0,
      default_vehicle_id: defaultVehicle,
    }).eq('id', nd.id)
    console.log(`  ✓ ${ed.name}`)
  }

  // 3. 場所移行
  console.log('\n--- 場所移行 ---')
  for (const p of existingPlaces) {
    const { error } = await supabase.from('places').insert({
      name: p.name,
      caution: p.caution || null,
      place_type: 'unload',
    })
    if (error) { console.error(`  ✗ ${p.name}: ${error.message}`); continue }
    console.log(`  ✓ ${p.name}`)
  }

  // 4. スケジュール移行
  console.log('\n--- スケジュール移行 ---')
  let ok = 0, ng = 0
  for (const s of existingSchedules) {
    const driverId = driverIdMap[String(s.driver_id)] || null
    const vehicleId = vehicleIdMap[String(s.vehicle_id)] || null
    const { error } = await supabase.from('schedules').insert({
      load_date: s.load_date || null,
      load_place: s.load_place || '',
      unload_date: s.unload_date || null,
      unload_place: s.unload_place || '',
      weight: Number(s.weight) || 0,
      driver_id: driverId,
      vehicle_id: vehicleId,
      note: s.note || '',
      done: !!s.done,
      load_status: s.load_status || 'none',
    })
    if (error) { console.error(`  ✗ ${s.id}: ${error.message}`); ng++; continue }
    ok++
  }
  console.log(`  完了: ${ok}件成功, ${ng}件エラー`)

  console.log('\n=== 移行完了 ===')
}

migrate().catch(console.error)
