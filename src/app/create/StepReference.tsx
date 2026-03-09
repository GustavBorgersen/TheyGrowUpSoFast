'use client'

import type { UnifiedPhoto } from '@/types'
import type { CreateDispatch } from './useCreateFlow'

type Props = {
  photos: UnifiedPhoto[]
  referenceId: string | null
  referencePhotoUrl: string | null
  dispatch: CreateDispatch
}

export function StepReference({ photos, referenceId, referencePhotoUrl, dispatch }: Props) {
  if (photos.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Upload photos first, then come back to pick a reference.</p>
    )
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Pick the photo with the clearest front-facing view. This sets the anchor face for alignment.
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
        {photos.map(photo => {
          const isSelected = photo.id === referenceId
          return (
            <button
              key={photo.id}
              onClick={() => {
                const url = URL.createObjectURL(photo.originalBlob)
                dispatch({ type: 'SET_REFERENCE', id: photo.id, blob: photo.originalBlob, url })
              }}
              className={`relative aspect-square overflow-hidden rounded-lg bg-zinc-900 transition ${
                isSelected ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-zinc-600'
              }`}
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
