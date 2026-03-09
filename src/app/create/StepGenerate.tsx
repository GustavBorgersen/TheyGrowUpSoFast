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

export function StepGenerate({ photos, profileThreshold, videoUrl, dispatch, projectName }: Props) {
  const { generate, encodingProgress } = useVideoGenerator()
  const [encoding, setEncoding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const includedPhotos = useMemo(() =>
    photos.filter(p => p.alignedBlob && !p.skipReason && (p.profileScore == null || p.profileScore <= profileThreshold)),
    [photos, profileThreshold]
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

      const blob = await generate(frames)
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
  }, [includedPhotos, generate, dispatch])

  const filename = projectName
    ? `${projectName.replace(/\s+/g, '-').toLowerCase()}.mp4`
    : 'timelapse.mp4'

  return (
    <div className="space-y-4">
      {!videoUrl && !encoding && (
        <button
          onClick={handleGenerate}
          disabled={includedPhotos.length === 0}
          className="w-full rounded-xl bg-blue-600 py-4 text-base font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
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
