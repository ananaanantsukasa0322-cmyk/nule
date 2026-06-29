/**
 * NULE → 既存サイト(localhost:5001) 一方向同期
 * 実行: npx tsx scripts/sync-to-local.ts
 */
import { createClient } from '@supabase/supabase-js'

const LOCAL_API = 'http://localhost:5001/api'
const SUPABASE_URL = 'https://sboudgqqipcdynplkwqq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3VkZ3FxaXBjZHlucGxrd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTc3NDYsImV4cCI6MjA5Nzg3Mzc0Nn0.xbDxJp6NoJAibTQRm2e3taciJ7NXwNTCsiF-QSwzXJE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function localGet(ep: string) { return fetch(`${LOCAL_API}/${ep}`).then(r => r.json()) }
async function localPost(ep: string, body: unknown) {
  return fetch(`${LOCAL_API}/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
}
async function localDelete(ep: string, id: number) {
  return fetch(`${LOCAL_API}/${ep}/${id}`, { method: 'DELETE' })
}

async function main() {
  console.log('=== NULE → 既存サイト 同期 ===\n')

  // NULEからデータ取得
  const { data: nuleSchedules } = await supabase.from('schedules').select('*')
  const { data: nuleDrivers } = await supabase.from('drivers').select('*').eq('is_active', true)
  const { data: nuleYoushas } = await supabase.from('youshas').select('*')

  // 既存サイトからデータ取得
  const localSchedules = await localGet('schedules')
  const localDrivers = await localGet('drivers')
  const localYoushas = await localGet('youshas')

  console.log(`NULE: ${(nuleSchedules || []).length}件 / 既存: ${localSchedules.length}件\n`)

  // ドライバーIDマッピング (NULE UUID → 既存 numeric)
  const driverToLocal: Record<string, string> = {}
  for (const nd of nuleDrivers || []) {
    const ld = localDrivers.find((d: { name: string }) => d.name.trim() === nd.name.trim())
    if (ld) driverToLocal[nd.id] = String(ld.id)
  }

  // 傭車IDマッピング
  const youshaToLocal: Record<string, string> = {}
  for (const ny of nuleYoushas || []) {
    const ly = localYoushas.find((y: { name: string }) => y.name.trim() === ny.name.trim())
    if (ly) youshaToLocal[ny.id] = String(ly.id)
  }

  // 既存サイトのスケジュールをキーでインデックス
  const localKeys = new Set(
    localSchedules.map((s: { load_date: string; unload_date: string; load_place: string; unload_place: string; driver_id: string }) =>
      `${s.load_date}|${s.unload_date}|${s.load_place}|${s.unload_place}|${s.driver_id || ''}`
    )
  )

  // NULEにあって既存にないスケジュールを追加
  let added = 0
  for (const ns of nuleSchedules || []) {
    // driver_id変換
    let localDriverId = ''
    const did = ns.driver_id || ''
    if (did.startsWith('y_')) {
      const yid = did.slice(2)
      if (youshaToLocal[yid]) localDriverId = `y_${youshaToLocal[yid]}`
    } else if (driverToLocal[did]) {
      localDriverId = driverToLocal[did]
    }

    const key = `${ns.load_date}|${ns.unload_date}|${ns.load_place}|${ns.unload_place}|${localDriverId}`
    if (localKeys.has(key)) continue

    await localPost('schedules', {
      load_date: ns.load_date,
      load_place: ns.load_place || '',
      unload_date: ns.unload_date,
      unload_place: ns.unload_place || '',
      weight: String(ns.weight || ''),
      driver_id: localDriverId,
      vehicle_id: '',
      note: ns.note || '',
      done: !!ns.done,
      load_status: ns.load_status || 'none',
      ai_tsumi: !!ns.ai_tsumi,
      ai_tsumi_group: ns.ai_tsumi_group || '',
      cargo_note: ns.cargo_note || '',
      items: ns.items || null,
      slot_index: ns.slot_index ?? null,
    })
    added++
    if (added <= 10) console.log(`  + ${ns.load_date} ${ns.load_place}→${ns.unload_place}`)
  }
  if (added > 10) console.log(`  ... 他${added - 10}件`)
  console.log(`\n追加: ${added}件（既存データは削除していません）`)
  console.log('=== 完了 ===')
}

main().catch(console.error)
