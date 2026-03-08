'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GooglePhoto } from '@/types'

const POLL_INTERVAL = 3000
const POLL_TIMEOUT = 5 * 60 * 1000 // 5 minutes

async function createPickerSession(token: string): Promise<{ pickerUri: string; sessionId: string }> {
  const res = await fetch('https://photospicker.googleapis.com/v1/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw Object.assign(new Error('Failed to create picker session'), { status: res.status })
  const data = await res.json()
  return { pickerUri: data.pickerUri, sessionId: data.id }
}

async function pollSession(
  sessionId: string,
  token: string,
  signal: AbortSignal
): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('Picker cancelled')
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
    if (signal.aborted) throw new Error('Picker cancelled')

    const res = await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw Object.assign(new Error('Session poll failed'), { status: res.status })
    const data = await res.json()
    if (data.mediaItemsSet) return
  }
  throw new Error('Picker timed out after 5 minutes')
}

async function fetchMediaItems(sessionId: string, token: string): Promise<GooglePhoto[]> {
  const photos: GooglePhoto[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`https://photospicker.googleapis.com/v1/mediaItems`)
    url.searchParams.set('sessionId', sessionId)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch media items')
    const data = await res.json()

    for (const item of data.mediaItems || []) {
      photos.push({
        id: item.mediaItem.id,
        baseUrl: item.mediaItem.baseUrl,
        createTime: item.mediaItem.createTime,
      })
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return photos.sort((a, b) => a.createTime.localeCompare(b.createTime))
}

async function getProviderToken(): Promise<string> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.provider_token
  if (!token) throw Object.assign(new Error('No Google access token'), { status: 401 })
  return token
}

async function refreshToken(): Promise<string | null> {
  const supabase = createClient()
  // Try silent re-auth first
  const origin = window.location.origin
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
        scopes: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
        queryParams: { prompt: 'none' },
        skipBrowserRedirect: true,
      },
    })
    if (!error) {
      const { data: { session } } = await supabase.auth.getSession()
      return session?.provider_token ?? null
    }
  } catch {
    // silent re-auth failed, fall through
  }
  return null
}

export function useGooglePhotosPicker() {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)

  async function openPicker(): Promise<GooglePhoto[]> {
    setIsOpen(true)
    setError(null)
    setTokenExpired(false)

    // MOBILE POPUP FIX: open popup synchronously in user gesture handler
    // Any await before window.open() causes popup blockers to trigger
    const popup = window.open('about:blank', '_blank', 'width=600,height=700')

    try {
      let token: string
      try {
        token = await getProviderToken()
      } catch (err) {
        if (popup && !popup.closed) popup.close()
        const e = err as { status?: number }
        if (e.status === 401) {
          setTokenExpired(true)
          setError('Google Photos access expired — click to reconnect')
        } else {
          setError('Could not get Google Photos access')
        }
        throw err
      }

      let session: { pickerUri: string; sessionId: string }
      try {
        session = await createPickerSession(token)
      } catch (err) {
        if (popup && !popup.closed) popup.close()
        const e = err as { status?: number }
        if (e.status === 401) {
          // Token expired — try to refresh
          const newToken = await refreshToken()
          if (!newToken) {
            setTokenExpired(true)
            setError('Google Photos access expired — click to reconnect')
            throw new Error('Token expired and refresh failed')
          }
          token = newToken
          const newPopup = window.open('about:blank', '_blank', 'width=600,height=700')
          session = await createPickerSession(token)
          if (newPopup) {
            newPopup.location.href = session.pickerUri
          }
        } else {
          setError('Failed to open Google Photos picker')
          throw err
        }
      }

      // Navigate popup to the picker URI (after async work — now it's safe)
      if (popup && !popup.closed) {
        popup.location.href = session.pickerUri
      }

      const abortController = new AbortController()
      const closeCheck = setInterval(() => {
        if (popup?.closed) abortController.abort()
      }, 500)

      try {
        await pollSession(session.sessionId, token, abortController.signal)
      } finally {
        clearInterval(closeCheck)
        if (popup && !popup.closed) popup.close()
      }

      const photos = await fetchMediaItems(session.sessionId, token)
      return photos
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg !== 'Picker cancelled') {
        setError(prev => prev ?? msg)
      }
      return []
    } finally {
      setIsOpen(false)
    }
  }

  return { openPicker, isOpen, error, tokenExpired }
}
