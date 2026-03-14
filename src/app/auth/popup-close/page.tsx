'use client'

import { useEffect } from 'react'

export default function PopupClosePage() {
  useEffect(() => {
    // Signal the opener via localStorage (COOP-safe cross-window communication)
    try { localStorage.setItem('auth:popup-complete', String(Date.now())) } catch {}
    window.close()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <p className="text-zinc-400 text-sm">You can close this window.</p>
    </main>
  )
}
