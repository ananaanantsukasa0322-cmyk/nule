import { getCurrentUser } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  let bodyHtml: string, css: string, js: string
  try {
    const pubDir = join(process.cwd(), 'public')
    bodyHtml = readFileSync(join(pubDir, 'dispatch-body.html'), 'utf-8')
    css = readFileSync(join(pubDir, 'dispatch-style.css'), 'utf-8')
    js = readFileSync(join(pubDir, 'dispatch-app.js'), 'utf-8')
  } catch {
    return new Response('Files not found', { status: 500 })
  }

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NULE - 配車管理</title>
  <style>${css}</style>
</head>
${bodyHtml}
<script>${js}</script>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
