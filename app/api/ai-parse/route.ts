import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['admin', 'office'])

    const formData = await request.formData()
    const file = formData.get('file') as File
    const parseType = formData.get('type') as string || 'daily_report'

    if (!file) return Response.json({ error: 'ファイルを選択してください' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = file.type === 'application/pdf' ? 'application/pdf' as const : 'image/jpeg' as const

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY未設定' }, { status: 500 })

    const client = new Anthropic({ apiKey })

    let prompt = ''
    if (parseType === 'daily_report') {
      prompt = `この画像は運送会社の手書き日報です。以下の情報を読み取ってJSON形式で返してください。

読み取る項目:
- entries: 配達情報の配列。各配達について:
  - shipper: 荷主名（荷主名の欄）
  - origin: 発地（積み地）
  - destination: 納入先（下ろし先）
  - product: 品名
  - weight: 重量（kg、数字のみ）

納入先（下ろし先）が読み取れない行は省いてください。

以下のJSON形式で返してください。JSON以外のテキストは含めないでください:
{"entries":[{"shipper":"","origin":"","destination":"","product":"","weight":""}]}`
    } else if (parseType === 'price_sheet') {
      prompt = `この画像は運送会社の単価表・料金表です。以下の情報を読み取ってJSON形式で返してください。

読み取る項目:
- entries: 単価情報の配列。各行について:
  - shipper: 荷主名
  - origin: 発地（積み地）
  - destination: 納入先（下ろし先）
  - price_type: "per_ton"（t単価）または "fixed"（固定）
  - rate: 単価金額（数字のみ）

以下のJSON形式で返してください。JSON以外のテキストは含めないでください:
{"entries":[{"shipper":"","origin":"","destination":"","price_type":"","rate":""}]}`
    }

    const contentBlock = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: base64 } }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6' as string,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [contentBlock, { type: 'text', text: prompt }],
      }],
    })

    const text = response.content.find(c => c.type === 'text')?.text || ''

    let parsed
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { entries: [] }
    } catch {
      parsed = { entries: [], raw: text }
    }

    if (parsed.entries) {
      parsed.entries = parsed.entries.filter((e: Record<string, string>) => e.destination && e.destination.trim())
    }
    return Response.json(parsed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'UNAUTHORIZED') return Response.json({ error: '未認証' }, { status: 401 })
    if (msg === 'FORBIDDEN') return Response.json({ error: '権限がありません' }, { status: 403 })
    console.error('AI parse error:', e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
