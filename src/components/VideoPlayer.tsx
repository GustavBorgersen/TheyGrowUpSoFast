'use client'

import { useState, useEffect } from 'react'

type Props = {
  src: string
  filename?: string
}

export function VideoPlayer({ src, filename = 'timelapse.mp4' }: Props) {
  const [canShare, setCanShare] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && 'share' in navigator)
  }, [])

  useEffect(() => {
    if (!shareError) return
    const timer = setTimeout(() => setShareError(null), 3000)
    return () => clearTimeout(timer)
  }, [shareError])

  async function handleShare() {
    setSharing(true)
    setShareError(null)
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const file = new File([blob], filename, { type: 'video/mp4' })
      if (!navigator.canShare({ files: [file] })) {
        setShareError('Sharing not supported in this browser')
        return
      }
      await navigator.share({ files: [file], title: filename.replace('.mp4', '') })
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setShareError('Could not share video')
      }
      // AbortError = user cancelled — silent
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* iOS requires playsinline, otherwise video goes fullscreen */}
      <video
        src={src}
        controls
        playsInline
        muted
        className="w-full max-w-sm mx-auto rounded-xl bg-black"
        style={{ aspectRatio: '4/5' }}
      />
      <div className="flex flex-wrap justify-center gap-3">
        <a
          href={src}
          download={filename}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-accent px-6 py-3 text-sm font-medium text-zinc-950 hover:bg-teal-accent/90 transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download MP4
        </a>
        {canShare && (
          <button
            onClick={handleShare}
            disabled={sharing}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-accent px-6 py-3 text-sm font-medium text-zinc-950 hover:bg-teal-accent/90 transition disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v13" />
            </svg>
            {sharing ? 'Sharing…' : 'Share'}
          </button>
        )}
      </div>
      {shareError && (
        <p className="text-center text-sm text-red-400">{shareError}</p>
      )}
    </div>
  )
}
