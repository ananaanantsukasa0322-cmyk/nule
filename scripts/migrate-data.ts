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
  console.log('=== 既存アプリからデータ取得中 ===')

  const [drivers, vehicles, schedules, places] = await Promise.all([
    fetchExisting('drivers'),
    fetchExisting('vehicles'),
    fetchExisting('schedules'),
    fetchExisting('places'),
  ])

  console.log(`ドライバー: ${drivers.length}件`)
  console.log(`車両: ${vehicles.length}件`)
  console.log(`スケジュール: ${schedules.length}件`)
  console.log(`場所: ${places.length}件`)

  // IDマッピング用
  const driverIdMap: Record<string, string> = {}
  const routeIdMap: Record<string, string> = {}

  // 1. ドライバー移行
  console.log('\n--- ドライバー移行 ---')
  for (const d of drivers) {
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        name: d.name.trim(),
        payment_percentage: 0,
        is_active: d.status === '稼働中',
      })
      .select('id')
      .single()

    if (error) {
      console.error(`  ✗ ${d.name}: ${error.message}`)
    } else {
      driverIdMap[String(d.id)] = data.id
      console.log(`  ✓ ${d.name}`)
    }
  }

  // 2. 場所からルート情報を抽出（スケジュールの積み地→下ろし先をルートとして登録）
  console.log('\n--- ルート移行 ---')
  const routeSet = new Set<string>()
  for (const s of schedules) {
    const key = `${s.load_place || ''}→${s.unload_place || ''}`
    if (s.load_place && s.unload_place && !routeSet.has(key)) {
      routeSet.add(key)
      const { data, error } = await supabase
        .from('routes')
        .insert({
          departure: s.load_place,
          destination: s.unload_place,
        })
        .select('id')
        .single()

      if (error) {
        console.error(`  ✗ ${key}: ${error.message}`)
      } else {
        routeIdMap[key] = data.id
        console.log(`  ✓ ${key}`)
      }
    }
  }

  // 3. スケジュール → 配車データとして移行
  console.log('\n--- 配車データ移行 ---')
  let successCount = 0
  let errorCount = 0

  for (const s of schedules) {
    const routeKey = `${s.load_place || ''}→${s.unload_place || ''}`
    const driverId = driverIdMap[String(s.driver_id)] || null
    const routeId = routeIdMap[routeKey] || null
    const weightKg = Number(s.weight) || 0
    const weightTon = weightKg / 1000

    const status = s.done ? 'completed' : (s.load_status === 'loaded' ? 'confirmed' : 'pending')

    const { error } = await supabase
      .from('dispatches')
      .insert({
        dispatch_date: s.load_date || new Date().toISOString().split('T')[0],
        driver_id: driverId,
        route_id: routeId,
        loading_place: s.load_place || null,
        unloading_place: s.unload_place || null,
        weight: weightTon,
        price_type: 'spot',
        spot_amount: 0,
        calculated_amount: 0,
        status,
      })

    if (error) {
      console.error(`  ✗ ID${s.id}: ${error.message}`)
      errorCount++
    } else {
      successCount++
    }
  }
  console.log(`  完了: ${successCount}件成功, ${errorCount}件エラー`)

  console.log('\n=== 移行完了 ===')
}

migrate().catch(console.error)
