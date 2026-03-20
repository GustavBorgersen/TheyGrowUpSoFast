'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { UnifiedPhoto, SkipReason, AlignSizeKey } from '@/types'
import type { CreateDispatch } from './useCreateFlow'
import { ALIGN_SIZE_PRESETS, DETECT_MAX_W } from '@/lib/faceAlign'
import { ProcessingView } from '@/components/ProcessingView'
import { withTimeout } from '@/lib/withTimeout'
import { tfBackendInfo } from '@/hooks/useFaceApi'
import { AUTH_ENABLED } from '@/lib/features'
import { dbg } from '@/lib/debugLog'

type Props = {
  photos: UnifiedPhoto[]
  referenceDescriptor: Float32Array | null
  alignProgress: { current: number; total: number } | null
  alignSize: AlignSizeKey
  dispatch: CreateDispatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faceApi: any
  faceApiLoaded: boolean
  runningRef: React.RefObject<boolean>
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => { URL.revokeObjectURL(url); resolve(el) }
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    el.src = url
  })
}

export function StepAlign({ photos, referenceDescriptor, alignProgress, alignSize, dispatch, faceApi, faceApiLoaded, runningRef }: Props) {
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
    const sizeConfig = ALIGN_SIZE_PRESETS[alignSize]

    const toAlign = photos.filter(p => !p.alignedBlob && !p.skipReason)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heapNow = () => { const m = (performance as any).memory; return m ? ` heap=${Math.round(m.usedJSHeapSize/1024/1024)}MB` : '' }
    dbg(`align: start n=${toAlign.length} size=${alignSize} backend=${tfBackendInfo}${heapNow()}`)
    dispatch({ type: 'ALIGN_PROGRESS', current: 0, total: toAlign.length })

    for (let i = 0; i < toAlign.length; i++) {
      if (abort.signal.aborted) break

      const photo = toAlign[i]
      dispatch({ type: 'ALIGN_PROGRESS', current: i + 1, total: toAlign.length })

      if (!canvasRef.current) break

      dbg(`align: photo ${i+1}/${toAlign.length} start blob=${Math.round(photo.originalBlob.size/1024)}KB${heapNow()}`)
      let img: HTMLImageElement
      try {
        img = await withTimeout(loadImageFromBlob(photo.originalBlob), 30_000, 'image load')
      } catch (err) {
        const reason: SkipReason = err instanceof Error && err.message.startsWith('Timeout') ? 'timeout' : 'error'
        dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason })
        setDiagLog(prev => [...prev, `#${i+1}: SKIP load (${reason})`])
        dbg(`align: photo ${i+1} skip load (${reason})`)
        continue
      }

      // Pre-downscale to cap the source canvas size before face detection.
      // The full-res HTMLImageElement decode (~98MB for a 4284×5712 photo) lives in the JS
      // heap and cannot be evicted by iOS — it will OOM-kill the tab. Drawing into a capped
      // canvas first lets us release the large decode before the detection tensors allocate.
      // Limit = max(DETECT_MAX_W, canvasW) so we never upscale for the output draw step.
      const naturalW = img.naturalWidth || img.width
      const naturalH = img.naturalHeight || img.height
      const maxSrc = Math.max(DETECT_MAX_W, sizeConfig.canvasW)
      let srcCanvas: HTMLCanvasElement | null = null
      let srcForAlign: HTMLImageElement | HTMLCanvasElement = img

      if (Math.max(naturalW, naturalH) > maxSrc) {
        const s = maxSrc / Math.max(naturalW, naturalH)
        const sw = Math.round(naturalW * s)
        const sh = Math.round(naturalH * s)
        srcCanvas = document.createElement('canvas')
        srcCanvas.width = sw
        srcCanvas.height = sh
        srcCanvas.getContext('2d')!.drawImage(img, 0, 0, sw, sh)
        img.src = '' // hint iOS GC to free the ~98MB full-res decode
        dbg(`align: photo ${i+1} pre-downscale ${naturalW}x${naturalH}→${sw}x${sh} (~${Math.round(sw*sh*4/1024/1024)}MB)${heapNow()}`)
        srcForAlign = srcCanvas
      }

      try {
        dbg(`align: photo ${i+1} detection start`)
        const result = await withTimeout(
          detectAndAlign(faceApi, srcForAlign, canvasRef.current, referenceDescriptor, sizeConfig),
          60_000, 'face detection'
        )
        if (srcCanvas) { srcCanvas.width = 0; srcCanvas = null } // release source canvas immediately
        dbg(`align: photo ${i+1} detection done${heapNow()}`)

        if (result.skipped) {
          dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason: result.reason })
          setDiagLog(prev => [...prev, `#${i+1}: SKIP detect (${result.reason})`])
          dbg(`align: photo ${i+1} skip detect (${result.reason})`)
          continue
        }

        const snapshot = document.createElement('canvas')
        snapshot.width = result.canvas.width
        snapshot.height = result.canvas.height
        snapshot.getContext('2d')!.drawImage(result.canvas, 0, 0)
        dbg(`align: photo ${i+1} snapshot ${snapshot.width}x${snapshot.height} (~${Math.round(snapshot.width*snapshot.height*4/1024/1024)}MB)${heapNow()}`)

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
        snapshot.width = 0 // release ~23MB backing store immediately (iOS won't GC promptly)

        const thumbBlob = await withTimeout(
          new Promise<Blob>((res, rej) =>
            thumbCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.80)
          ),
          15_000, 'thumbnail export'
        )
        thumbCanvas.width = 0 // release backing store
        dbg(`align: photo ${i+1} blobs done${heapNow()}`)
        const alignedThumbUrl = URL.createObjectURL(thumbBlob)

        dispatch({
          type: 'PHOTO_ALIGNED',
          id: photo.id,
          alignedBlob,
          alignedThumbUrl,
          descriptor: result.descriptor,
          profileScore: result.profileScore,
          pitchScore: result.pitchScore,
        })

        dbg(`align: photo ${i+1} done`)
        if (result.diag) {
          const d = result.diag
          setDiagLog(prev => [...prev,
            `#${i+1}: ${d.srcW}x${d.srcH} → ${d.dw}x${d.dh} | faces=${d.facesFound} dist=${d.matchDist.toFixed(3)} | angle=${d.angleDeg.toFixed(1)}° IPD=${d.currentIPD.toFixed(0)} scale=${d.scaleF.toFixed(2)} eyes=(${d.leftEye.x.toFixed(0)},${d.leftEye.y.toFixed(0)})-(${d.rightEye.x.toFixed(0)},${d.rightEye.y.toFixed(0)})`
          ])
        }
      } catch (err) {
        if (srcCanvas) { srcCanvas.width = 0 } // ensure release on error path
        console.error('[align] error:', err)
        const reason: SkipReason = err instanceof Error && err.message.startsWith('Timeout') ? 'timeout' : 'error'
        dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason })
        dbg(`align: photo ${i+1} error ${err instanceof Error ? err.message + ' | stack: ' + (err.stack ?? '') : String(err)}`)
      }

      // Yield to let iOS GC canvas buffers before allocating for the next photo
      await new Promise(r => setTimeout(r, 0))
    }

    dbg('align: complete')
    abortRef.current = null
    dispatch({ type: 'ALIGNMENT_DONE' })
    runningRef.current = false
  }, [photos, referenceDescriptor, alignProgress, alignSize, dispatch, faceApi, runningRef])

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

  const debugOverlay = AUTH_ENABLED && diagLog.length > 0 && (
    <details className="mt-4">
      <summary className="text-xs text-zinc-500 cursor-pointer">Debug info ({diagLog.length} photos) — {tfBackendInfo}</summary>
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

  const sizeOptions: { key: AlignSizeKey; label: string; dims: string }[] = [
    { key: 'small',    label: 'Small',    dims: '720×900' },
    { key: 'standard', label: 'Standard', dims: '1080×1350' },
    { key: 'large',    label: 'Large',    dims: '2160×2700' },
  ]

  // Ready to align
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        {unalignedCount} photo{unalignedCount !== 1 ? 's' : ''} ready to align.
      </p>

      {/* Output size selector */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">Output size</p>
        <div className="flex gap-2">
          {sizeOptions.map(({ key, label, dims }) => (
            <button
              key={key}
              onClick={() => dispatch({ type: 'SET_ALIGN_SIZE', size: key })}
              disabled={isRunning || !faceApiLoaded}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition disabled:opacity-50 ${
                alignSize === key
                  ? 'border-teal-accent bg-teal-accent text-zinc-950'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              <span className="block">{label}</span>
              <span className="block text-xs opacity-70">{dims}</span>
            </button>
          ))}
        </div>
        {alignSize === 'large' && (
          <p className="text-xs text-zinc-500">Larger files, slower encoding</p>
        )}
      </div>

      <button
        onClick={handleStart}
        disabled={!faceApiLoaded}
        className="w-full rounded-xl bg-teal-accent py-3 text-sm font-semibold text-zinc-950 hover:bg-teal-accent/90 disabled:opacity-50 transition min-h-[44px]"
      >
        {!faceApiLoaded ? 'Loading face detection...' : `Start alignment (${unalignedCount} photo${unalignedCount !== 1 ? 's' : ''})`}
      </button>
      {debugOverlay}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
