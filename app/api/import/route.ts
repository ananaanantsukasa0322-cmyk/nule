import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const formData = await request.formData()
    const file = formData.get('file') as File
    const target = formData.get('target') as string

    if (!file || !target) {
      return Response.json({ error: 'ファイルと対象を指定してください' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let rows: Record<string, unknown>[] = []

    if (file.name.endsWith('.csv')) {
      const text = buffer.toString('utf-8')
      const wb = XLSX.read(text, { type: 'string' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(ws)
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(ws)
    }

    if (rows.length === 0) {
      return Response.json({ error: 'データが空です' }, { status: 400 })
    }

    let inserted = 0
    let errors = 0

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
      const { data: existing } = await supabase.from('drivers').select('id,name')
      for (const row of rows) {
        const name = String(row['名前'] || row['氏名'] || row['name'] || '').trim()
        if (!name) { errors++; continue }
        const values: Record<string, unknown> = {
          name,
          phone: String(row['連絡先'] || row['電話番号'] || row['phone'] || ''),
          status: String(row['状態'] || row['status'] || '稼働中'),
        }
        const pay = row['支払率'] ?? row['payment_percentage']
        if (pay != null && pay !== '') values.payment_percentage = Number(pay) || 0
        // 名前一致（空白無視）で既存を更新、なければ新規
        const norm = (n: string) => n.replace(/[\s　]/g, '')
        const match = (existing || []).find(d => norm(d.name) === norm(name))
        const { error } = match
          ? await supabase.from('drivers').update(values).eq('id', match.id)
          : await supabase.from('drivers').insert(values)
        if (error) errors++; else inserted++
      }
    } else if (target === 'vehicles') {
      const { data: existing } = await supabase.from('vehicles').select('id,number,head_number')
      for (const row of rows) {
        const number = String(row['ナンバー'] || row['車番'] || row['number'] || '').trim()
        const headNumber = String(row['ヘッド'] || row['ヘッド車番'] || row['head_number'] || '').trim()
        const values: Record<string, unknown> = {}
        if (row['種別'] || row['kind']) values.kind = String(row['種別'] || row['kind'])
        if (number) values.number = number
        if (headNumber) values.head_number = headNumber
        if (row['台車'] || row['シャーシ'] || row['trailer_number']) values.trailer_number = String(row['台車'] || row['シャーシ'] || row['trailer_number'])
        const payload = row['積載量'] ?? row['payload']
        if (payload != null && payload !== '') values.payload = Number(String(payload).replace(/[,kg]/g, '')) || 0
        if (row['メモ'] || row['note']) values.note = String(row['メモ'] || row['note'])
        const shaken = normDate(row['車検日'] ?? row['車検'] ?? row['shaken_date'])
        if (shaken) values.shaken_date = shaken
        const insp = normDate(row['3ヶ月点検'] ?? row['3ヶ月点検日'] ?? row['点検日'] ?? row['inspection_3m_date'])
        if (insp) values.inspection_3m_date = insp
        if (row['修理情報'] || row['repair_note']) values.repair_note = String(row['修理情報'] || row['repair_note'])
        if (row['注意事項'] || row['caution']) values.caution = String(row['注意事項'] || row['caution'])

        if (!number && !headNumber) { errors++; continue }
        // 車番またはヘッド車番一致で既存を更新、なければ新規
        const match = (existing || []).find(v =>
          (number && (v.number === number || v.head_number === number)) ||
          (headNumber && (v.head_number === headNumber || v.number === headNumber))
        )
        const { error } = match
          ? await supabase.from('vehicles').update(values).eq('id', match.id)
          : await supabase.from('vehicles').insert({ kind: 'トラック', ...values })
        if (error) errors++; else inserted++
      }
    } else if (target === 'clients') {
      for (const row of rows) {
        const company_name = String(row['会社名'] || row['company_name'] || '').trim()
        if (!company_name) { errors++; continue }
        const { error } = await supabase.from('clients').insert({
          company_name,
          address: String(row['住所'] || row['address'] || ''),
          contact: String(row['連絡先'] || row['contact'] || ''),
        })
        if (error) errors++; else inserted++
      }
    } else if (target === 'prices') {
      for (const row of rows) {
        const price_type = String(row['タイプ'] || row['price_type'] || 'fixed')
        const { error } = await supabase.from('prices').insert({
          client_id: row['client_id'] || null,
          route_id: row['route_id'] || null,
          price_type,
          per_ton_rate: Number(row['t単価'] || row['per_ton_rate'] || 0) || null,
          fixed_amount: Number(row['固定金額'] || row['fixed_amount'] || 0) || null,
        })
        if (error) errors++; else inserted++
      }
    } else if (target === 'daily_reports') {
      for (const row of rows) {
        const report_date = String(row['日付'] || row['report_date'] || '').trim()
        if (!report_date) { errors++; continue }
        const { error } = await supabase.from('daily_reports').insert({
          report_date,
          ocr_text: String(row['内容'] || row['ocr_text'] || ''),
          notes: String(row['備考'] || row['notes'] || ''),
          status: 'pending',
        })
        if (error) errors++; else inserted++
      }
    } else {
      return Response.json({ error: '不明な対象: ' + target }, { status: 400 })
    }

    return Response.json({ inserted, errors, total: rows.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
