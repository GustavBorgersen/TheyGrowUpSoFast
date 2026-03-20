'use client'

import { useState } from 'react'
import type { UnifiedPhoto } from '@/types'
import type { CreateDispatch } from './useCreateFlow'
import { dbg } from '@/lib/debugLog'

type Props = {
  photos: UnifiedPhoto[]
  referenceId: string | null
  referencePhotoUrl: string | null
  referenceDescriptor: Float32Array | null
  dispatch: CreateDispatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faceApi: any
  faceApiLoaded: boolean
}

export function StepReference({ photos, referenceId, referencePhotoUrl, referenceDescriptor, dispatch, faceApi, faceApiLoaded }: Props) {
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const newPhotos = photos.filter(p => p.source.kind !== 'saved')

  const handlePick = async (photo: UnifiedPhoto) => {
    if (!faceApi || detecting) return
    setDetecting(true)
    setDetectError(null)
    dbg(`ref: pick start blob=${Math.round(photo.originalBlob.size/1024)}KB`)

    try {
      // Load image
      const url = URL.createObjectURL(photo.originalBlob)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('Failed to load image'))
        el.src = url
      })

      // Downscale to match faceAlign's DETECT_MAX_W (1600) so descriptors
      // are computed at the same resolution as alignment detection
      const DETECT_MAX_W = 1600
      const srcW = img.naturalWidth || img.width
      const srcH = img.naturalHeight || img.height
      const scale = Math.min(1, DETECT_MAX_W / Math.max(srcW, srcH, 1))
      const dw = Math.round(srcW * scale)
      const dh = Math.round(srcH * scale)

      dbg(`ref: canvas ${dw}x${dh} (~${Math.round(dw*dh*4/1024/1024)}MB) from src ${srcW}x${srcH}`)
      const detectCanvas = document.createElement('canvas')
      detectCanvas.width = dw
      detectCanvas.height = dh
      const detectCtx = detectCanvas.getContext('2d')!
      detectCtx.drawImage(img, 0, 0, dw, dh)

      URL.revokeObjectURL(url)

      dbg('ref: detection start')
      // Detect all faces, pick highest confidence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detections: any[] = await faceApi
        .detectAllFaces(detectCanvas)
        .withFaceLandmarks()
        .withFaceDescriptors()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heapAfter = (performance as any).memory
      dbg(`ref: detection done faces=${detections?.length ?? 0}${heapAfter ? ` heap=${Math.round(heapAfter.usedJSHeapSize/1024/1024)}MB` : ''}`)

      if (!detections || detections.length === 0) {
        detectCanvas.width = 0 // release backing store
        dbg('ref: no face')
        setDetectError('No face detected in this photo. Pick another.')
        setDetecting(false)
        return
      }

      // Pick highest confidence face
      const best = detections.reduce((a, b) => a.detection.score > b.detection.score ? a : b)
      const descriptor = new Float32Array(best.descriptor)

      // Export the downscaled detect canvas as the preview image.
      // Do NOT use photo.originalBlob for display — on a 4284×5712 source that
      // decodes to ~98MB and OOM-kills the iOS tab when the <img> renders.
      const previewBlob = await new Promise<Blob>((res, rej) =>
        detectCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.85)
      )
      detectCanvas.width = 0 // release backing store immediately (iOS won't GC promptly)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heapAfterExport = (performance as any).memory
      dbg(`ref: preview exported ${Math.round(previewBlob.size/1024)}KB${heapAfterExport ? ` heap=${Math.round(heapAfterExport.usedJSHeapSize/1024/1024)}MB` : ''}`)

      const thumbUrl = URL.createObjectURL(previewBlob)
      dispatch({ type: 'SET_REFERENCE', id: photo.id, blob: photo.originalBlob, url: thumbUrl, descriptor })
      dbg('ref: done')
    } catch (err) {
      console.error('[reference] detection error:', err)
      dbg(`ref: error ${err instanceof Error ? err.message + ' | stack: ' + (err.stack ?? '') : String(err)}`)
      setDetectError('Face detection failed. Try another photo.')
    } finally {
      setDetecting(false)
    }
  }

  if (referencePhotoUrl) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-400">This photo anchors the face alignment.</p>
        <div className="overflow-hidden rounded-xl bg-zinc-900">
          <img src={referencePhotoUrl} alt="Reference" className="w-full object-contain max-h-80" />
        </div>
        <button
          onClick={() => dispatch({ type: 'CLEAR_REFERENCE' })}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition"
        >
          Change reference photo
        </button>
      </div>
    )
  }

  if (referenceDescriptor && newPhotos.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Reference loaded from saved project. Upload new photos to pick a different reference.
      </p>
    )
  }

  if (newPhotos.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Upload photos first, then come back to pick a reference.</p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Pick the photo with the clearest front-facing view. This sets the anchor face for alignment.
      </p>
      {!faceApiLoaded && (
        <p className="text-xs text-zinc-500">Loading face detection...</p>
      )}
      {detectError && (
        <p className="text-sm text-red-400">{detectError}</p>
      )}
      {detecting && (
        <p className="text-sm text-teal-accent">Detecting face...</p>
      )}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
        {newPhotos.map(photo => {
          const isSelected = photo.id === referenceId
          return (
            <button
              key={photo.id}
              onClick={() => handlePick(photo)}
              disabled={!faceApiLoaded || detecting}
              className={`relative aspect-square overflow-hidden rounded-lg bg-zinc-900 transition ${
                isSelected ? 'ring-2 ring-teal-accent' : 'hover:ring-2 hover:ring-zinc-600'
              } ${(!faceApiLoaded || detecting) ? 'opacity-50' : ''}`}
            >
              <img
                src={photo.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {isSelected && (
                <div className="absolute inset-x-0 bottom-0 bg-teal-accent/90 px-1 py-0.5 text-center">
                  <span className="text-[10px] font-medium text-zinc-950">Reference</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
