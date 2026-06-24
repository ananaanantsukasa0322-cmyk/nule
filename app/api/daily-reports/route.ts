import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const status = request.nextUrl.searchParams.get('status')
    const driverId = request.nextUrl.searchParams.get('driver_id')

    let query = supabase
      .from('daily_reports')
      .select('*, driver:drivers(*), dispatch:dispatches(*)')

    if (status) query = query.eq('status', status)
    if (driverId) query = query.eq('driver_id', driverId)

    const { data, error } = await query.order('report_date', { ascending: false })

    if (error) throw error
    return Response.json({ reports: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const formData = await request.formData()
    const reportDate = formData.get('report_date') as string
    const driverId = formData.get('driver_id') as string
    const file = formData.get('file') as File | null

    let pdfUrl = null
    let ocrText = null

    if (file) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      pdfUrl = `data:application/pdf;base64,${buffer.toString('base64')}`
      ocrText = '[AI-OCR処理: PDFアップロード済み - 手動確認が必要]'
    }

    const { data, error } = await supabase
      .from('daily_reports')
      .insert({
        report_date: reportDate,
        driver_id: driverId || null,
        pdf_url: pdfUrl,
        ocr_text: ocrText,
        status: 'pending',
      })
      .select('*, driver:drivers(*)')
      .single()

    if (error) throw error
    return Response.json({ report: data }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(['admin'])
    const body = await request.json()

    const { data, error } = await supabase
      .from('daily_reports')
      .update({
        ocr_text: body.ocr_text,
        ocr_data: body.ocr_data || null,
        status: body.status,
        dispatch_id: body.dispatch_id || null,
        notes: body.notes || null,
        driver_id: body.driver_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select('*, driver:drivers(*), dispatch:dispatches(*)')
      .single()

    if (error) throw error
    return Response.json({ report: data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    if (message === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (message === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    return Response.json({ error: message }, { status: 500 })
  }
}
