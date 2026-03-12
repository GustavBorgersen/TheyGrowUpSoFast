'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { UnifiedPhoto, SkipReason } from '@/types'
import type { CreateDispatch } from './useCreateFlow'
import { ProcessingView } from '@/components/ProcessingView'
import { withTimeout } from '@/lib/withTimeout'

type Props = {
  photos: UnifiedPhoto[]
  referenceDescriptor: Float32Array | null
  alignProgress: { current: number; total: number } | null
  dispatch: CreateDispatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faceApi: any
  faceApiLoaded: boolean
  runningRef: React.RefObject<boolean>
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Failed to load image'))
    el.src = url
  })
  URL.revokeObjectURL(url)

  const w = img.naturalWidth, h = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return canvas
}

export function StepAlign({ photos, referenceDescriptor, alignProgress, dispatch, faceApi, faceApiLoaded, runningRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [diagLog, setDiagLog] = useState<string[]>([])

  const runAlignment = useCallback(async () => {
    // Gate: only run when START_ALIGNMENT has set alignProgress to non-null
    if (!alignProgress) return
    if (runningRef.current || !faceApi || !referenceDescriptor || !canvasRef.current) return
    runningRef.current = true

    const abort = new AbortController()
    abortRef.current = abort

    const { detectAndAlign } = await import('@/lib/faceAlign')

    const toAlign = photos.filter(p => !p.alignedBlob && !p.skipReason)

    dispatch({ type: 'ALIGN_PROGRESS', current: 0, total: toAlign.length })

    for (let i = 0; i < toAlign.length; i++) {
      if (abort.signal.aborted) break

      const photo = toAlign[i]
      dispatch({ type: 'ALIGN_PROGRESS', current: i + 1, total: toAlign.length })

      if (!canvasRef.current) break

      let img: HTMLCanvasElement
      try {
        img = await withTimeout(loadImageFromBlob(photo.originalBlob), 30_000, 'image load')
      } catch (err) {
        const reason: SkipReason = err instanceof Error && err.message.startsWith('Timeout') ? 'timeout' : 'error'
        dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason })
        continue
      }

      try {
        const result = await withTimeout(
          detectAndAlign(faceApi, img, canvasRef.current, referenceDescriptor),
          60_000, 'face detection'
        )

        if (result.skipped) {
          dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason: result.reason })
          continue
        }

        const snapshot = document.createElement('canvas')
        snapshot.width = result.canvas.width
        snapshot.height = result.canvas.height
        snapshot.getContext('2d')!.drawImage(result.canvas, 0, 0)

        const alignedBlob = await withTimeout(
          new Promise<Blob>((res, rej) =>
            snapshot.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.85)
          ),
          15_000, 'aligned frame export'
        )

        const thumbCanvas = document.createElement('canvas')
        const thumbH = Math.round(snapshot.height * (300 / snapshot.width))
        thumbCanvas.width = 300
        thumbCanvas.height = thumbH
        thumbCanvas.getContext('2d')!.drawImage(snapshot, 0, 0, 300, thumbH)
        const thumbBlob = await withTimeout(
          new Promise<Blob>((res, rej) =>
            thumbCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.80)
          ),
          15_000, 'thumbnail export'
        )
        const alignedThumbUrl = URL.createObjectURL(thumbBlob)

        dispatch({
          type: 'PHOTO_ALIGNED',
          id: photo.id,
          alignedBlob,
          alignedThumbUrl,
          descriptor: result.descriptor,
          profileScore: result.profileScore,
        })

        if (result.diag) {
          const d = result.diag
          setDiagLog(prev => [...prev,
            `#${i+1}: ${d.srcW}x${d.srcH} → ${d.dw}x${d.dh} | angle=${d.angleDeg.toFixed(1)}° IPD=${d.currentIPD.toFixed(0)} scale=${d.scaleF.toFixed(2)} eyes=(${d.leftEye.x.toFixed(0)},${d.leftEye.y.toFixed(0)})-(${d.rightEye.x.toFixed(0)},${d.rightEye.y.toFixed(0)})`
          ])
        }
      } catch (err) {
        console.error('[align] error:', err)
        const reason: SkipReason = err instanceof Error && err.message.startsWith('Timeout') ? 'timeout' : 'error'
        dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason })
      }
    }

    abortRef.current = null
    dispatch({ type: 'ALIGNMENT_DONE' })
    runningRef.current = false
  }, [photos, referenceDescriptor, alignProgress, dispatch, faceApi, runningRef])

  // Run alignment when alignProgress is set (via START_ALIGNMENT)
  useEffect(() => {
    runAlignment()
  }, [runAlignment])

  const hasReference = referenceDescriptor !== null
  const unalignedCount = photos.filter(p => !p.alignedBlob && !p.skipReason && p.source.kind !== 'saved').length
  const current = alignProgress?.current ?? 0
  const total = alignProgress?.total ?? 0
  const isRunning = runningRef.current || (total > 0 && current <= total && alignProgress !== null)

  const handleStart = () => {
    dispatch({ type: 'START_ALIGNMENT' })
  }

  const skippedPhotos = photos
    .filter(p => p.skipReason)
    .map(p => ({ name: p.source.kind === 'local' ? p.source.file.name : p.id, reason: p.skipReason! }))

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const debugOverlay = diagLog.length > 0 && (
    <details className="mt-4">
      <summary className="text-xs text-zinc-500 cursor-pointer">Debug info ({diagLog.length} photos)</summary>
      <textarea
        readOnly
        value={diagLog.join('\n')}
        className="mt-1 w-full h-40 text-xs font-mono bg-zinc-900 text-zinc-400 border border-zinc-700 rounded p-2 select-all"
        onFocus={e => e.target.select()}
      />
    </details>
  )

  // Running state
  if (isRunning) {
    return (
      <div className="space-y-4">
        <ProcessingView
          status="aligning"
          current={current}
          total={total}
          encodingProgress={0}
          skipped={skippedPhotos}
        />
        <button
          onClick={handleCancel}
          className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition min-h-[44px]"
        >
          Cancel alignment
        </button>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    )
  }

  // No reference picked
  if (!hasReference) {
    return (
      <div>
        <p className="text-sm text-zinc-500">Pick a reference photo first, then come back to align.</p>
        {debugOverlay}
      </div>
    )
  }

  // No unaligned photos
  if (unalignedCount === 0) {
    return (
      <div>
        <p className="text-sm text-zinc-500">All photos are aligned. Upload more to align them.</p>
        {debugOverlay}
      </div>
    )
  }

  // Ready to align
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        {unalignedCount} photo{unalignedCount !== 1 ? 's' : ''} ready to align.
      </p>
      <button
        onClick={handleStart}
        disabled={!faceApiLoaded}
        className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
      >
        {!faceApiLoaded ? 'Loading face detection...' : `Start alignment (${unalignedCount} photo${unalignedCount !== 1 ? 's' : ''})`}
      </button>
      {debugOverlay}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
