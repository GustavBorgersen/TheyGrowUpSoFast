'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GooglePhoto } from '@/types'

interface PollingConfig {
  pollInterval: number // ms
  timeoutIn: number // ms
}

/** Parse Google Duration string like "3.5s" into milliseconds */
function parseDuration(duration: string | undefined, fallbackMs: number): number {
  if (!duration) return fallbackMs
  const match = duration.match(/^([\d.]+)s$/)
  return match ? parseFloat(match[1]) * 1000 : fallbackMs
}

async function createPickerSession(token: string): Promise<{
  pickerUri: string
  sessionId: string
  pollingConfig: PollingConfig
}> {
  const res = await fetch('https://photospicker.googleapis.com/v1/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw Object.assign(new Error('Failed to create picker session'), { status: res.status })
  const data = await res.json()
  return {
    pickerUri: data.pickerUri,
    sessionId: data.id,
    pollingConfig: {
      pollInterval: parseDuration(data.pollingConfig?.pollInterval, 3000),
      timeoutIn: parseDuration(data.pollingConfig?.timeoutIn, 5 * 60 * 1000),
    },
  }
}

async function checkSession(
  sessionId: string,
  token: string
): Promise<{ ready: boolean; pollingConfig: PollingConfig }> {
  const res = await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw Object.assign(new Error('Session poll failed'), { status: res.status })
  const data = await res.json()
  return {
    ready: data.mediaItemsSet === true,
    pollingConfig: {
      pollInterval: parseDuration(data.pollingConfig?.pollInterval, 3000),
      timeoutIn: parseDuration(data.pollingConfig?.timeoutIn, 5 * 60 * 1000),
    },
  }
}

async function pollSession(
  sessionId: string,
  token: string,
  initialPollingConfig: PollingConfig
): Promise<boolean> {
  const deadline = Date.now() + initialPollingConfig.timeoutIn
  let pollInterval = initialPollingConfig.pollInterval

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollInterval))

    const result = await checkSession(sessionId, token)
    console.log('[picker] poll: ready=%s, pollInterval=%dms', result.ready, result.pollingConfig.pollInterval)
    if (result.ready) return true
    pollInterval = result.pollingConfig.pollInterval
  }

  return false
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
      // Picker API v1 puts baseUrl inside mediaFile; fall back to top-level baseUrl just in case
      const baseUrl = item.mediaFile?.baseUrl ?? item.baseUrl
      photos.push({
        id: item.id,
        baseUrl,
        createTime: item.createTime,
      })
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return photos.sort((a, b) => a.createTime.localeCompare(b.createTime))
}

async function deleteSession(sessionId: string, token: string): Promise<void> {
  try {
    await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup — don't fail the flow
  }
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
    console.log('[picker] popup opened:', !!popup)

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

      let session: { pickerUri: string; sessionId: string; pollingConfig: PollingConfig }
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

      // Navigate popup to the picker URI
      if (popup && !popup.closed) {
        popup.location.href = session.pickerUri + '/autoclose'
      }

      console.log('[picker] polling session:', session.sessionId)
      const selected = await pollSession(session.sessionId, token, session.pollingConfig)
      console.log('[picker] poll result:', selected)

      // Close popup once we have a result (like the MVP did)
      if (popup && !popup.closed) popup.close()

      if (!selected) return [] // timed out

      const photos = await fetchMediaItems(session.sessionId, token)
      console.log('[picker] fetched', photos.length, 'photos')

      // Clean up the session (best-effort)
      await deleteSession(session.sessionId, token)

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
