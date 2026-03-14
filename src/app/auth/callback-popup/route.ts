import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Popup-specific OAuth callback. Always redirects to /auth/popup-close
 * after exchanging the code, so the popup window closes itself.
 *
 * This avoids relying on a `?next=` query param surviving the OAuth round-trip
 * (Supabase PKCE flow can strip extra query params).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/auth/popup-close`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/popup-close`)
}
