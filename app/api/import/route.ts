import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import * as XLSX from 'xlsx'

// タイトル行（「〇〇部門乗務員・車輌一覧」等）が1行目にあるExcelだと、
// 本来のヘッダー行がデータ行として扱われてしまうため、実際にヘッダーらしき
// 行（対象ごとのキーワードを含む行）を探してそこを起点に読み込む
const HEADER_KEYWORDS: Record<string, string[]> = {
  drivers: ['名前', '氏名', 'name'],
  vehicles: ['ナンバー', '車番', 'number', 'ヘッド', 'head_number'],
  clients: ['会社名', 'company_name'],
  prices: ['タイプ', 'price_type'],
  daily_reports: ['日付', 'report_date'],
}

// 「ヘッド情報」「トレーラー情報」のように同じ列名（車番・メーカー等）が
// 複数グループで繰り返されるExcelだと、SheetJSが車番_1・車番_2のように
// 連番を振るため、完全一致ではなく部分一致で最初に見つかった値を使う
function findValueByKeyword(row: Record<string, unknown>, keywords: string[]): string {
  for (const key of Object.keys(row)) {
    if (keywords.some((k) => key.includes(k))) {
      const v = row[key]
      if (v != null && String(v).trim() !== '') return String(v).trim()
    }
  }
  return ''
}

function findHeaderRowIndex(ws: XLSX.WorkSheet, keywords: string[]): number {
  if (!keywords.length) return 0
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
  const maxScan = Math.min(raw.length, 10)
  for (let i = 0; i < maxScan; i++) {
    const cells = (raw[i] || []).map((c) => String(c ?? '').trim())
    if (cells.some((c) => keywords.some((k) => c.includes(k)))) return i
  }
  return 0
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const formData = await request.formData()
    const file = formData.get('file') as File
    const target = formData.get('target') as string
    const category = (formData.get('category') as string) || 'steel'
    // 完全同期：Excelにある内容で全項目を上書きし、Excelに無い既存データは無効化する
    const fullSync = formData.get('fullSync') === 'true'

    if (!file || !target) {
      return Response.json({ error: 'ファイルと対象を指定してください' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let rows: Record<string, unknown>[] = []
    const keywords = HEADER_KEYWORDS[target] || []

    if (file.name.endsWith('.csv')) {
      const text = buffer.toString('utf-8')
      const wb = XLSX.read(text, { type: 'string' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const headerRow = findHeaderRowIndex(ws, keywords)
      rows = XLSX.utils.sheet_to_json(ws, { range: headerRow })
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const headerRow = findHeaderRowIndex(ws, keywords)
      rows = XLSX.utils.sheet_to_json(ws, { range: headerRow })
    }

    if (rows.length === 0) {
      return Response.json({ error: 'データが空です' }, { status: 400 })
    }

    let inserted = 0
    let errors = 0
    let deactivated = 0
    const errorDetails: string[] = []
    function addError(rowIndex: number, reason: string) {
      errors++
      if (errorDetails.length < 10) errorDetails.push(`行${rowIndex + 2}: ${reason}`)
    }

    // 日付らしき値をYYYY-MM-DDに正規化（Excelシリアル値・スラッシュ区切り対応）
    function normDate(v: unknown): string | null {
      if (v == null || v === '') return null
      if (typeof v === 'number') {
        // Excelシリアル値
        const d = new Date(Math.round((v - 25569) * 86400 * 1000))
        if (isNaN(d.getTime())) return null
        return d.toISOString().slice(0, 10)
      }
      const s = String(v).trim().replace(/[年月]/g, '-').replace(/日/g, '').replace(/\//g, '-')
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      return null
    }

    if (target === 'drivers') {
      const { data: existing } = await supabase.from('drivers').select('id,name,category').eq('is_active', true)
      const matchedIds = new Set<string>()
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const name = String(row['名前'] || row['氏名'] || row['name'] || '').trim()
        if (!name) { addError(i, `名前の列が見つかりません（実際の列名: ${Object.keys(row).join('、') || 'なし'}）`); continue }
        const pay = row['支払率'] ?? row['payment_percentage']
        const values: Record<string, unknown> = {
          name,
          phone: String(row['連絡先'] || row['電話番号'] || row['phone'] || ''),
          status: String(row['状態'] || row['status'] || '稼働中'),
          category,
        }
        // 完全同期時は空欄も含め毎回上書きする。通常時は値がある列だけ更新する
        if (fullSync) values.payment_percentage = pay != null && pay !== '' ? Number(pay) || 0 : 0
        else if (pay != null && pay !== '') values.payment_percentage = Number(pay) || 0
        // 名前一致（空白無視）で既存を更新、なければ新規
        const norm = (n: string) => n.replace(/[\s　]/g, '')
        const match = (existing || []).find(d => norm(d.name) === norm(name))
        if (match) matchedIds.add(match.id)
        const { error } = match
          ? await supabase.from('drivers').update(values).eq('id', match.id)
          : await supabase.from('drivers').insert(values)
        if (error) addError(i, error.message); else inserted++
      }
      if (fullSync) {
        const toDeactivate = (existing || []).filter(d => (d.category || 'steel') === category && !matchedIds.has(d.id))
        for (const d of toDeactivate) {
          const { error } = await supabase.from('drivers').update({ is_active: false }).eq('id', d.id)
          if (!error) deactivated++
        }
      }
    } else if (target === 'vehicles') {
      const { data: existing } = await supabase.from('vehicles').select('id,number,head_number,category').eq('is_active', true)
      const matchedIds = new Set<string>()
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const number = findValueByKeyword(row, ['ナンバー', '車番', 'number'])
        const headNumber = findValueByKeyword(row, ['ヘッド', 'head_number'])
        const trailerNumber = findValueByKeyword(row, ['台車', 'シャーシ', 'トレーラー', 'trailer_number'])
        const payload = row['積載量'] ?? row['payload']
        const values: Record<string, unknown> = { category }
        if (fullSync) {
          // 完全同期時は空欄も含め毎回上書きする
          values.kind = String(row['種別'] || row['kind'] || 'トラック')
          values.number = number || null
          values.head_number = headNumber || null
          values.trailer_number = trailerNumber || null
          values.payload = payload != null && payload !== '' ? Number(String(payload).replace(/[,kg]/g, '')) || 0 : 0
          values.note = String(row['メモ'] || row['note'] || '') || null
          values.shaken_date = normDate(row['車検日'] ?? row['車検'] ?? row['shaken_date'])
          values.inspection_3m_date = normDate(row['3ヶ月点検'] ?? row['3ヶ月点検日'] ?? row['点検日'] ?? row['inspection_3m_date'])
          values.repair_note = String(row['修理情報'] || row['repair_note'] || '') || null
          values.caution = String(row['注意事項'] || row['caution'] || '') || null
        } else {
          if (row['種別'] || row['kind']) values.kind = String(row['種別'] || row['kind'])
          if (number) values.number = number
          if (headNumber) values.head_number = headNumber
          if (trailerNumber) values.trailer_number = trailerNumber
          if (payload != null && payload !== '') values.payload = Number(String(payload).replace(/[,kg]/g, '')) || 0
          if (row['メモ'] || row['note']) values.note = String(row['メモ'] || row['note'])
          const shaken = normDate(row['車検日'] ?? row['車検'] ?? row['shaken_date'])
          if (shaken) values.shaken_date = shaken
          const insp = normDate(row['3ヶ月点検'] ?? row['3ヶ月点検日'] ?? row['点検日'] ?? row['inspection_3m_date'])
          if (insp) values.inspection_3m_date = insp
          if (row['修理情報'] || row['repair_note']) values.repair_note = String(row['修理情報'] || row['repair_note'])
          if (row['注意事項'] || row['caution']) values.caution = String(row['注意事項'] || row['caution'])
        }

        if (!number && !headNumber) { addError(i, `車番・ヘッドの列が見つかりません（実際の列名: ${Object.keys(row).join('、') || 'なし'}）`); continue }
        // 車番またはヘッド車番一致で既存を更新、なければ新規
        const match = (existing || []).find(v =>
          (number && (v.number === number || v.head_number === number)) ||
          (headNumber && (v.head_number === headNumber || v.number === headNumber))
        )
        if (match) matchedIds.add(match.id)
        const { error } = match
          ? await supabase.from('vehicles').update(values).eq('id', match.id)
          : await supabase.from('vehicles').insert({ kind: 'トラック', ...values })
        if (error) addError(i, error.message); else inserted++
      }
      if (fullSync) {
        const toDeactivate = (existing || []).filter(v => (v.category || 'steel') === category && !matchedIds.has(v.id))
        for (const v of toDeactivate) {
          const { error } = await supabase.from('vehicles').update({ is_active: false }).eq('id', v.id)
          if (!error) deactivated++
        }
      }
    } else if (target === 'clients') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const company_name = String(row['会社名'] || row['company_name'] || '').trim()
        if (!company_name) { addError(i, `会社名の列が見つかりません（実際の列名: ${Object.keys(row).join('、') || 'なし'}）`); continue }
        const { error } = await supabase.from('clients').insert({
          company_name,
          address: String(row['住所'] || row['address'] || ''),
          contact: String(row['連絡先'] || row['contact'] || ''),
        })
        if (error) addError(i, error.message); else inserted++
      }
    } else if (target === 'prices') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const price_type = String(row['タイプ'] || row['price_type'] || 'fixed')
        const { error } = await supabase.from('prices').insert({
          client_id: row['client_id'] || null,
          route_id: row['route_id'] || null,
          price_type,
          per_ton_rate: Number(row['t単価'] || row['per_ton_rate'] || 0) || null,
          fixed_amount: Number(row['固定金額'] || row['fixed_amount'] || 0) || null,
          category,
        })
        if (error) addError(i, error.message); else inserted++
      }
    } else if (target === 'daily_reports') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const report_date = String(row['日付'] || row['report_date'] || '').trim()
        if (!report_date) { addError(i, `日付の列が見つかりません（実際の列名: ${Object.keys(row).join('、') || 'なし'}）`); continue }
        const { error } = await supabase.from('daily_reports').insert({
          report_date,
          ocr_text: String(row['内容'] || row['ocr_text'] || ''),
          notes: String(row['備考'] || row['notes'] || ''),
          status: 'pending',
        })
        if (error) addError(i, error.message); else inserted++
      }
    } else {
      return Response.json({ error: '不明な対象: ' + target }, { status: 400 })
    }

    return Response.json({ inserted, errors, total: rows.length, errorDetails, deactivated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
