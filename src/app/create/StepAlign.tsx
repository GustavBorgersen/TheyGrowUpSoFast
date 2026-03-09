'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { UnifiedPhoto } from '@/types'
import type { CreateDispatch } from './useCreateFlow'
import { ProcessingView } from '@/components/ProcessingView'

type Props = {
  photos: UnifiedPhoto[]
  referenceId: string | null
  referenceDescriptor: Float32Array | null
  alignProgress: { current: number; total: number } | null
  dispatch: CreateDispatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faceApi: any
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

export function StepAlign({ photos, referenceId, referenceDescriptor, alignProgress, dispatch, faceApi }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runningRef = useRef(false)

  const runAlignment = useCallback(async () => {
    // Need either a selected reference photo OR a pre-loaded descriptor (from saved project)
    if (runningRef.current || !faceApi || (!referenceId && !referenceDescriptor) || !canvasRef.current) return
    runningRef.current = true

    const { detectAndAlign } = await import('@/lib/faceAlign')

    // If we already have a descriptor (loaded project), skip reference alignment.
    // Otherwise, put the reference photo first so we get its descriptor.
    let reference: Float32Array | null = referenceDescriptor ?? null

    let toAlign: UnifiedPhoto[]
    if (referenceDescriptor) {
      // Only align photos that aren't already processed
      toAlign = photos.filter(p => !p.alignedBlob && !p.skipReason)
    } else {
      const refPhoto = photos.find(p => p.id === referenceId)
      if (!refPhoto) { runningRef.current = false; return }
      toAlign = [refPhoto, ...photos.filter(p => p.id !== referenceId && !p.alignedBlob && !p.skipReason)]
    }

    dispatch({ type: 'ALIGN_PROGRESS', current: 0, total: toAlign.length })

    for (let i = 0; i < toAlign.length; i++) {
      const photo = toAlign[i]
      dispatch({ type: 'ALIGN_PROGRESS', current: i + 1, total: toAlign.length })

      if (!canvasRef.current) break

      let img: HTMLImageElement
      try {
        img = await loadImageFromBlob(photo.originalBlob)
      } catch {
        dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason: 'no_face' })
        continue
      }

      try {
        const isRef = !referenceDescriptor && photo.id === referenceId
        const maxProfileScore = isRef ? 0.8 : 999
        const result = await detectAndAlign(faceApi, img, canvasRef.current, reference, maxProfileScore)

        if (result.skipped) {
          dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason: result.reason })
          continue
        }

        // First photo aligned gives us the reference descriptor
        if (reference === null) {
          reference = result.descriptor
        }

        // Snapshot aligned frame
        const snapshot = document.createElement('canvas')
        snapshot.width = result.canvas.width
        snapshot.height = result.canvas.height
        snapshot.getContext('2d')!.drawImage(result.canvas, 0, 0)

        const alignedBlob = await new Promise<Blob>((res, rej) =>
          snapshot.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.85)
        )

        // Create thumbnail
        const thumbCanvas = document.createElement('canvas')
        const thumbH = Math.round(snapshot.height * (300 / snapshot.width))
        thumbCanvas.width = 300
        thumbCanvas.height = thumbH
        thumbCanvas.getContext('2d')!.drawImage(snapshot, 0, 0, 300, thumbH)
        const thumbBlob = await new Promise<Blob>((res, rej) =>
          thumbCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.80)
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
      } catch (err) {
        console.error('[align] error:', err)
        dispatch({ type: 'PHOTO_SKIPPED', id: photo.id, reason: 'no_face' })
      }
    }

    dispatch({ type: 'ALIGNMENT_DONE' })
    runningRef.current = false
  }, [photos, referenceId, referenceDescriptor, dispatch, faceApi])

  // Auto-run alignment when step is entered
  useEffect(() => {
    runAlignment()
  }, [runAlignment])

  const current = alignProgress?.current ?? 0
  const total = alignProgress?.total ?? 0
  const isRunning = total > 0 && current <= total

  return (
    <div className="space-y-4">
      <ProcessingView
        status={isRunning ? 'aligning' : 'idle'}
        current={current}
        total={total}
        encodingProgress={0}
        skipped={[]}
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
