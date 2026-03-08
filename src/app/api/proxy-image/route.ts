import { NextResponse } from 'next/server'

const ALLOWED_URL = /^https:\/\/(lh\d\.googleusercontent\.com|photos\.googleapis\.com)\//

export async function POST(req: Request) {
  try {
    const { url, token } = await req.json()

    if (!url || !token) {
      return new NextResponse('Missing url or token', { status: 400 })
    }

    // Prevent arbitrary URL proxying — only Google domains allowed
    if (!ALLOWED_URL.test(url)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Append =d to force direct download, bypasses Google's CORS restrictions
    const fetchUrl = url.endsWith('=d') ? url : `${url}=d`

    const res = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
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
