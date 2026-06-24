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

    if (target === 'drivers') {
      for (const row of rows) {
        const name = String(row['名前'] || row['name'] || '').trim()
        if (!name) { errors++; continue }
        const { error } = await supabase.from('drivers').insert({
          name,
          phone: String(row['連絡先'] || row['phone'] || ''),
          payment_percentage: Number(row['支払率'] || row['payment_percentage'] || 0),
          status: String(row['状態'] || row['status'] || '稼働中'),
        })
        if (error) errors++; else inserted++
      }
    } else if (target === 'vehicles') {
      for (const row of rows) {
        const kind = String(row['種別'] || row['kind'] || 'トラック')
        const { error } = await supabase.from('vehicles').insert({
          kind,
          number: String(row['ナンバー'] || row['number'] || ''),
          head_number: String(row['ヘッド'] || row['head_number'] || ''),
          trailer_number: String(row['台車'] || row['trailer_number'] || ''),
          payload: Number(row['積載量'] || row['payload'] || 0),
          note: String(row['メモ'] || row['note'] || ''),
        })
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
