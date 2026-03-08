'use client'

import type { ProjectPhoto } from '@/types'

const SKIP_LABELS: Record<string, string> = {
  no_face: 'No face',
  profile_angle: 'Profile',
  identity_mismatch: 'Wrong person',
}

type Props = {
  photos: ProjectPhoto[]
  getThumbnailUrl: (path: string) => string
  onRemove?: (photoId: string) => void
}

export function PhotoGrid({ photos, getThumbnailUrl, onRemove }: Props) {
  if (photos.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-700 text-zinc-500 text-sm">
        No photos yet
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {photos.map(photo => (
        <div key={photo.id} className="relative group aspect-[4/5] overflow-hidden rounded-lg bg-zinc-900">
          {photo.thumbnail_path ? (
            <img
              src={getThumbnailUrl(photo.thumbnail_path)}
              alt=""
              loading="lazy"
              className={`h-full w-full object-cover ${photo.skipped ? 'opacity-40' : ''}`}
            />
          ) : (
            <div className="h-full w-full bg-zinc-800" />
          )}

          {photo.skipped && photo.skip_reason && (
            <div className="absolute inset-0 flex items-end justify-center bg-black/40 p-1">
              <span className="rounded bg-red-900/80 px-1.5 py-0.5 text-[10px] text-red-300">
                {SKIP_LABELS[photo.skip_reason] ?? photo.skip_reason}
              </span>
            </div>
          )}

          {onRemove && (
            <button
              onClick={() => onRemove(photo.id)}
              className="absolute top-1 right-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
              aria-label="Remove photo"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
