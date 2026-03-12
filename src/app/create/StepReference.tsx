'use client'

import { useState } from 'react'
import type { UnifiedPhoto } from '@/types'
import type { CreateDispatch } from './useCreateFlow'

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

    try {
      // Load image
      const url = URL.createObjectURL(photo.originalBlob)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('Failed to load image'))
        el.src = url
      })

      // Detect all faces, pick highest confidence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detections: any[] = await faceApi
        .detectAllFaces(img)
        .withFaceLandmarks()
        .withFaceDescriptors()

      URL.revokeObjectURL(url)

      if (!detections || detections.length === 0) {
        setDetectError('No face detected in this photo. Pick another.')
        setDetecting(false)
        return
      }

      // Pick highest confidence face
      const best = detections.reduce((a, b) => a.detection.score > b.detection.score ? a : b)
      const descriptor = new Float32Array(best.descriptor)

      const thumbUrl = URL.createObjectURL(photo.originalBlob)
      dispatch({ type: 'SET_REFERENCE', id: photo.id, blob: photo.originalBlob, url: thumbUrl, descriptor })
    } catch (err) {
      console.error('[reference] detection error:', err)
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
        <p className="text-sm text-blue-400">Detecting face...</p>
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
                isSelected ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-zinc-600'
              } ${(!faceApiLoaded || detecting) ? 'opacity-50' : ''}`}
            >
              <img
                src={photo.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {isSelected && (
                <div className="absolute inset-x-0 bottom-0 bg-blue-600/90 px-1 py-0.5 text-center">
                  <span className="text-[10px] font-medium text-white">Reference</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
