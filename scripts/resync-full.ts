import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'

const EXISTING_API = 'http://localhost:5001/api'
const SUPABASE_URL = 'https://sboudgqqipcdynplkwqq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3VkZ3FxaXBjZHlucGxrd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTc3NDYsImV4cCI6MjA5Nzg3Mzc0Nn0.xbDxJp6NoJAibTQRm2e3taciJ7NXwNTCsiF-QSwzXJE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ⚠️ このスクリプトは既存データを絶対に削除しません
// 新規スケジュールの追加のみ行います

async function main() {
  console.log('=== 安全同期モード（追加のみ・削除なし） ===')

  // バックアップ
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync('backups', { recursive: true })
  const { data: currentScheds } = await supabase.from('schedules').select('*')
  writeFileSync(`backups/schedules_before_sync_${timestamp}.json`, JSON.stringify(currentScheds || [], null, 2))
  console.log(`バックアップ: ${(currentScheds || []).length}件保存`)

  // 既存ツールから取得
  const eScheds = await fetch(`${EXISTING_API}/schedules`).then(r => r.json())
  console.log(`既存ツール: ${eScheds.length}件`)
  console.log(`NULE現在: ${(currentScheds || []).length}件`)

  // NULE側に存在しないスケジュールだけ追加
  // 判定: load_date + unload_date + load_place + unload_place + driver_id(マッピング後)
  const nuleKeys = new Set(
    (currentScheds || []).map(s => `${s.load_date}|${s.unload_date}|${s.load_place}|${s.unload_place}|${s.driver_id || ''}`)
  )

  // ドライバーIDマッピング
  const eDr = await fetch(`${EXISTING_API}/drivers`).then(r => r.json())
  const { data: nDr } = await supabase.from('drivers').select('id, name').eq('is_active', true)
  const dMap: Record<string, string> = {}
  for (const ed of eDr) {
    const nd = (nDr || []).find((d: {name:string}) => d.name.trim() === ed.name.trim())
    if (nd) dMap[String(ed.id)] = nd.id
  }

  // 傭車IDマッピング
  const eYo = await fetch(`${EXISTING_API}/youshas`).then(r => r.json())
  const { data: nYo } = await supabase.from('youshas').select('id, name')
  const yMap: Record<string, string> = {}
  for (const ey of eYo) {
    const ny = (nYo || []).find((y: {name:string}) => y.name.trim() === ey.name.trim())
    if (ny) yMap[String(ey.id)] = ny.id
  }

  // 車両IDマッピング（番号で照合）
  const eVe = await fetch(`${EXISTING_API}/vehicles`).then(r => r.json())
  const { data: nVe } = await supabase.from('vehicles').select('id, number, head_number')
  const vMap: Record<string, string> = {}
  for (const ev of eVe) {
    const matchKey = ev.kind === 'トレーラー' ? ev.head_number : ev.number
    const nv = (nVe || []).find((v: {number:string;head_number:string}) => v.number === matchKey || v.head_number === matchKey)
    if (nv) vMap[String(ev.id)] = nv.id
  }

  let added = 0, skipped = 0
  for (const s of eScheds) {
    let driver_id: string | null = null
    const did = String(s.driver_id || '')
    if (did.startsWith('y_')) {
      const oldYId = did.slice(2)
      if (yMap[oldYId]) driver_id = `y_${yMap[oldYId]}`
    } else if (did && dMap[did]) {
      driver_id = dMap[did]
    }

    const key = `${s.load_date}|${s.unload_date}|${s.load_place || ''}|${s.unload_place || ''}|${driver_id || ''}`
    if (nuleKeys.has(key)) { skipped++; continue }

    const vehicle_id = s.vehicle_id ? vMap[String(s.vehicle_id)] || null : null

    await supabase.from('schedules').insert({
      load_date: s.load_date || null, load_place: s.load_place || '',
      unload_date: s.unload_date || null, unload_place: s.unload_place || '',
      weight: Number(s.weight) || 0, driver_id, vehicle_id,
      note: s.note || '', done: !!s.done, load_status: s.load_status || 'none',
      ai_tsumi: !!s.ai_tsumi, ai_tsumi_group: s.ai_tsumi_group || null,
      cargo_note: s.cargo_note || null, items: s.items || null,
      slot_index: s.slot_index != null ? Number(s.slot_index) : null,
    })
    added++
  }

  console.log(`\n結果: ${added}件追加 / ${skipped}件スキップ（既存）`)
  console.log('⚠️ 既存データは一切削除していません')
}
main().catch(console.error)
