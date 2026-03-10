'use client'

import { useMemo } from 'react'
import type { UnifiedPhoto } from '@/types'
import type { CreateDispatch } from './useCreateFlow'

const SKIP_LABELS: Record<string, string> = {
  no_face: 'No face',
  profile_angle: 'Profile',
  identity_mismatch: 'Wrong person',
}

type Props = {
  photos: UnifiedPhoto[]
  profileThreshold: number
  dispatch: CreateDispatch
}

export function StepReview({ photos, profileThreshold, dispatch }: Props) {
  const alignedPhotos = photos
    .filter(p => p.alignedBlob || p.skipReason)
    .sort((a, b) => a.createTime - b.createTime)

  const filteredOutIds = useMemo(() => {
    const ids = new Set<string>()
    for (const p of photos) {
      if (p.skipReason) continue
      if (p.profileScore != null && p.profileScore > profileThreshold) {
        ids.add(p.id)
      }
    }
    return ids
  }, [photos, profileThreshold])

  const includedCount = photos.filter(p => p.alignedBlob && !p.skipReason && !filteredOutIds.has(p.id)).length

  if (alignedPhotos.length === 0) {
    return <p className="text-sm text-zinc-500">No aligned photos to review.</p>
  }

  return (
    <div className="space-y-4">
      {/* Profile filter slider */}
      <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <label className="text-sm text-zinc-400 shrink-0">Profile filter</label>
        <input
          type="range"
          min={0.1}
          max={1.0}
          step={0.05}
          value={profileThreshold}
          onChange={e => dispatch({ type: 'SET_PROFILE_THRESHOLD', value: parseFloat(e.target.value) })}
          className="flex-1 accent-blue-500"
        />
        <span className="text-sm text-zinc-300 w-12 text-right">{(profileThreshold * 100).toFixed(0)}%</span>
      </div>

      <p className="text-sm text-zinc-400">
        {includedCount} photo{includedCount !== 1 ? 's' : ''} included · {filteredOutIds.size} filtered · {photos.filter(p => p.skipReason).length} skipped
      </p>

      {/* Grid of aligned thumbnails */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {alignedPhotos.map(photo => {
          const isFiltered = filteredOutIds.has(photo.id)
          const dimmed = !!photo.skipReason || isFiltered

          return (
            <div key={photo.id} className="relative group aspect-[4/5] overflow-hidden rounded-lg bg-zinc-900">
              {photo.alignedThumbUrl ? (
                <img
                  src={photo.alignedThumbUrl}
                  alt=""
                  loading="lazy"
                  className={`h-full w-full object-cover ${dimmed ? 'opacity-40' : ''}`}
                />
              ) : (
                <div className={`h-full w-full bg-zinc-800 ${dimmed ? 'opacity-40' : ''}`} />
              )}

              {photo.skipReason && (
                <div className="absolute inset-0 flex items-end justify-center bg-black/40 p-1">
                  <span className="rounded bg-red-900/80 px-1.5 py-0.5 text-[10px] text-red-300">
                    {SKIP_LABELS[photo.skipReason] ?? photo.skipReason}
                  </span>
                </div>
              )}

              {isFiltered && !photo.skipReason && (
                <div className="absolute inset-0 flex items-end justify-center bg-black/40 p-1">
                  <span className="rounded bg-amber-900/80 px-1.5 py-0.5 text-[10px] text-amber-300">
                    Filtered
                  </span>
                </div>
              )}

              {photo.profileScore != null && !photo.skipReason && (
                <div className="absolute top-1 left-1">
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {(photo.profileScore * 100).toFixed(0)}%
                  </span>
                </div>
              )}

              {!photo.skipReason && (
                <button
                  onClick={() => dispatch({ type: 'REMOVE_ALIGNED', id: photo.id })}
                  className="absolute top-1 right-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex"
                  aria-label="Remove aligned data"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
