'use client'

import { useState, useMemo, useCallback } from 'react'
import type { UnifiedPhoto } from '@/types'
import type { CreateDispatch } from './useCreateFlow'
import { useVideoGenerator } from '@/hooks/useVideoGenerator'
import { ProcessingView } from '@/components/ProcessingView'
import { VideoPlayer } from '@/components/VideoPlayer'

type Props = {
  photos: UnifiedPhoto[]
  profileThreshold: number
  pitchThreshold: number
  videoUrl: string | null
  dispatch: CreateDispatch
  projectName: string | null
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

export function StepGenerate({ photos, profileThreshold, pitchThreshold, videoUrl, dispatch, projectName }: Props) {
  const { generate, encodingProgress, encodingFrame } = useVideoGenerator()
  const [encoding, setEncoding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frameDuration, setFrameDuration] = useState(1.0)

  const includedPhotos = useMemo(() =>
    photos
      .filter(p => {
        if (!p.alignedBlob || p.skipReason) return false
        if (p.userOverride === 'include') return true
        if (p.userOverride === 'exclude') return false
        return (p.profileScore == null || p.profileScore <= profileThreshold) &&
               (p.pitchScore == null || p.pitchScore <= pitchThreshold)
      })
      .sort((a, b) => a.createTime - b.createTime),
    [photos, profileThreshold, pitchThreshold]
  )

  const handleGenerate = useCallback(async () => {
    if (includedPhotos.length === 0) return

    setEncoding(true)
    setError(null)

    try {
      const frames: HTMLCanvasElement[] = []
      for (const photo of includedPhotos) {
        const img = await loadImageFromBlob(photo.alignedBlob!)
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || img.width
        c.height = img.naturalHeight || img.height
        c.getContext('2d')!.drawImage(img, 0, 0)
        frames.push(c)
      }

      const blob = await generate(frames, frameDuration)
      const url = URL.createObjectURL(blob)
      dispatch({ type: 'SET_VIDEO_URL', url })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video encoding failed'
      const sabHint = typeof SharedArrayBuffer === 'undefined'
        ? ' Your browser may not support SharedArrayBuffer — try Chrome or Edge over HTTPS.'
        : ''
      setError(msg + sabHint)
    } finally {
      setEncoding(false)
    }
  }, [includedPhotos, frameDuration, generate, dispatch])

  const filename = projectName
    ? `${projectName.replace(/\s+/g, '-').toLowerCase()}.mp4`
    : 'timelapse.mp4'

  if (includedPhotos.length === 0 && !encoding && !videoUrl) {
    return <p className="text-sm text-zinc-500">No photos ready. Align and review photos first.</p>
  }

  return (
    <div className="space-y-4">
      {/* Frame duration slider */}
      {!encoding && (
        <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <label className="text-sm text-zinc-400 shrink-0">Seconds per photo</label>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={frameDuration}
            onChange={e => setFrameDuration(parseFloat(e.target.value))}
            className="flex-1 accent-teal-accent"
          />
          <span className="text-sm text-zinc-300 w-10 text-right">{frameDuration}s</span>
        </div>
      )}

      {!videoUrl && !encoding && (
        <button
          onClick={handleGenerate}
          disabled={includedPhotos.length === 0}
          className="w-full rounded-xl bg-teal-accent py-4 text-base font-semibold text-zinc-950 hover:bg-teal-accent/90 disabled:opacity-50 transition min-h-[44px]"
        >
          Generate video ({includedPhotos.length} photo{includedPhotos.length !== 1 ? 's' : ''})
        </button>
      )}

      {encoding && (
        <ProcessingView
          status="encoding"
          current={0}
          total={0}
          encodingProgress={encodingProgress}
          encodingFrame={encodingFrame}
          skipped={[]}
        />
      )}

      {error && (
        <div className="space-y-3">
          <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">{error}</p>
          <button
            onClick={() => setError(null)}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 min-h-[44px]"
          >
            Try again
          </button>
        </div>
      )}

      {videoUrl && (
        <div className="space-y-4">
          <VideoPlayer src={videoUrl} filename={filename} />
          <button
            onClick={handleGenerate}
            className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-500 transition min-h-[44px]"
          >
            Regenerate ({includedPhotos.length} photos)
          </button>
        </div>
      )}
    </div>
  )
}
