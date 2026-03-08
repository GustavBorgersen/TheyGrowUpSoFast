import { NextResponse } from 'next/server'

const ALLOWED_URL = /^https:\/\/(lh\d\.googleusercontent\.com|photos\.googleapis\.com)\//

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('[proxy-image] body:', JSON.stringify(body).slice(0, 200))
    const { url, token } = body

    if (!url || !token) {
      console.log('[proxy-image] missing fields — url:', !!url, 'token:', !!token)
      return new NextResponse('Missing url or token', { status: 400 })
    }

    // Prevent arbitrary URL proxying — only Google domains allowed
    if (!ALLOWED_URL.test(url)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      console.error('[proxy-image] upstream error:', res.status, await res.text().catch(() => ''))
      return new NextResponse('Failed to fetch image', { status: res.status })
    }

    const buf = await res.arrayBuffer()

    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[proxy-image]', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
