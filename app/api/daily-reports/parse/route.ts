import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])
    const formData = await request.formData()
    const file = formData.get('file') as File
    const driverName = formData.get('driver_name') as string || ''
    const reportDate = formData.get('report_date') as string || ''

    if (!file) return Response.json({ error: 'ファイルを選択してください' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let text = ''
    try {
      const pdfParse = await import('pdf-parse')
      const parseFn = typeof pdfParse === 'function' ? pdfParse : (pdfParse as unknown as {default: Function}).default
      const pdf = await parseFn(buffer)
      text = pdf.text || ''
    } catch {
      text = ''
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    const entries: { shipper: string; origin: string; destination: string; product: string; weight: string }[] = []

    const weightPattern = /(\d{3,6})\s*kg/gi
    const weights: string[] = []
    for (const line of lines) {
      let m
      while ((m = weightPattern.exec(line)) !== null) {
        weights.push(m[1])
      }
    }

    const knownPlaces = ['安城', '鉄埠', '岐阜五十鈴', '大翔', '日鉄', 'POSCO', '東晃', 'NCC', 'アイチ', '栃木合同', 'TMS']
    const knownDest = ['三恵技研', 'トーカイ', '岡谷特殊', 'YSMC', '山本', '恵那', 'ナンカイ', 'SSS', '中部', '玉船', '月東', '神谷', 'ファイツール', '長野精工', '今仙電機', 'アサヒフォージ', '東プレ', '中野プレス', 'サニア', '加洋', '太平洋', 'カワセ', '海津', '松久', '久野金', 'J-MAX', '小熊', '旭金属', '高橋金属', '松尾', '鬼頭', 'ユニクレア', '三重コンドー', 'NCC/レベラー', '伊勢湾', '金城', '千葉旭', 'ミヤムラ', '住商', '山鋼', 'まこと', '豊商', '日物']
    const knownShippers = ['日通', '名古屋港鉄鋼埠頭', 'ワーレックス', '久木野', '大翔', 'アイチ物流', '美石']
    const knownProducts = ['コイル', 'SC', '亜鉛コイル', '矢板', '特丸', 'H鋼', 'タルク', '鉄板', '丸棒']

    const foundPlaces: string[] = []
    const foundDest: string[] = []
    const foundShippers: string[] = []
    const foundProducts: string[] = []

    for (const line of lines) {
      for (const p of knownPlaces) { if (line.includes(p) && !foundPlaces.includes(p)) foundPlaces.push(p) }
      for (const d of knownDest) { if (line.includes(d) && !foundDest.includes(d)) foundDest.push(d) }
      for (const s of knownShippers) { if (line.includes(s) && !foundShippers.includes(s)) foundShippers.push(s) }
      for (const pr of knownProducts) { if (line.includes(pr) && !foundProducts.includes(pr)) foundProducts.push(pr) }
    }

    const maxRows = Math.max(weights.length, foundDest.length, 1)
    for (let i = 0; i < maxRows; i++) {
      entries.push({
        shipper: foundShippers[Math.min(i, foundShippers.length - 1)] || '',
        origin: foundPlaces[Math.min(i, foundPlaces.length - 1)] || '',
        destination: foundDest[i] || '',
        product: foundProducts[Math.min(i, foundProducts.length - 1)] || '',
        weight: weights[i] || '',
      })
    }

    return Response.json({
      raw_text: text,
      entries,
      driver_name: driverName,
      report_date: reportDate,
      found: { places: foundPlaces, destinations: foundDest, shippers: foundShippers, products: foundProducts, weights },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    console.error('PDF parse error:', e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
