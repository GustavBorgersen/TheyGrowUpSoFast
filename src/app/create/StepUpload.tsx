'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { UnifiedPhoto } from '@/types'
import type { CreateDispatch } from './useCreateFlow'
import { useGooglePhotosPicker } from '@/hooks/useGooglePhotosPicker'

type Props = {
  photos: UnifiedPhoto[]
  dispatch: CreateDispatch
  isLoggedIn: boolean
}

export function StepUpload({ photos, dispatch, isLoggedIn }: Props) {
  const router = useRouter()
  const [isDragging, setIsDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const { openPicker, isOpen: pickerOpen, error: pickerError } = useGooglePhotosPicker()

  const addFiles = useCallback(async (incoming: File[]) => {
    const imageFiles = incoming.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    const existingKeys = new Set(photos.map(p => {
      if (p.source.kind === 'local') return `${p.source.file.name}-${p.source.file.size}`
      return p.id
    }))

    const dedupedFiles = imageFiles.filter(f => !existingKeys.has(`${f.name}-${f.size}`))
    if (dedupedFiles.length === 0) return

    // Extract EXIF DateTimeOriginal for accurate chronological ordering
    const exifr = (await import('exifr')).default
    const newPhotos: UnifiedPhoto[] = await Promise.all(
      dedupedFiles.map(async f => {
        let createTime = f.lastModified
        try {
          const exif = await exifr.parse(f, ['DateTimeOriginal', 'CreateDate'])
          const exifDate = exif?.DateTimeOriginal ?? exif?.CreateDate
          if (exifDate instanceof Date && !isNaN(exifDate.getTime())) {
            createTime = exifDate.getTime()
          }
        } catch { /* fall back to lastModified */ }
        return {
          id: crypto.randomUUID(),
          source: { kind: 'local' as const, file: f },
          thumbnailUrl: URL.createObjectURL(f),
          originalBlob: f,
          createTime,
          alignedBlob: null,
          alignedThumbUrl: null,
          descriptor: null,
          profileScore: null,
          skipReason: null,
        }
      })
    )

    dispatch({ type: 'ADD_PHOTOS', photos: newPhotos })
  }, [photos, dispatch])

  const handleGooglePhotos = useCallback(async () => {
    // Check for a valid Google token before opening the picker popup.
    // If the token is missing (session expired, or user authenticated
    // without the Google Photos scope), redirect to login instead of
    // opening a popup that immediately fails.
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token
    if (!token) {
      router.push('/login')
      return
    }

    setImporting(true)
    try {
      const googlePhotos = await openPicker()
      if (googlePhotos.length === 0) return

      // Deduplicate by googleId
      const existingGoogleIds = new Set(
        photos.filter(p => p.source.kind === 'google').map(p => (p.source as { kind: 'google'; googleId: string }).googleId)
      )
      const newGooglePhotos = googlePhotos.filter(p => !existingGoogleIds.has(p.id))
      if (newGooglePhotos.length === 0) return

      const newPhotos: UnifiedPhoto[] = []
      for (const gp of newGooglePhotos) {
        try {
          const res = await fetch('/api/proxy-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `${gp.baseUrl}=w2048`, token }),
          })
          if (!res.ok) continue
          const blob = await res.blob()
          newPhotos.push({
            id: crypto.randomUUID(),
            source: { kind: 'google', googleId: gp.id, createTime: gp.createTime },
            thumbnailUrl: URL.createObjectURL(blob),
            originalBlob: blob,
            createTime: new Date(gp.createTime).getTime(),
            alignedBlob: null,
            alignedThumbUrl: null,
            descriptor: null,
            profileScore: null,
            skipReason: null,
          })
        } catch {
          // skip failed downloads
        }
      }

      if (newPhotos.length > 0) {
        dispatch({ type: 'ADD_PHOTOS', photos: newPhotos })
      }
    } finally {
      setImporting(false)
    }
  }, [photos, openPicker, dispatch, router])

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition cursor-pointer ${
          isDragging ? 'border-blue-500 bg-blue-950/20' : 'border-zinc-700 hover:border-zinc-500'
        } ${photos.length > 0 ? 'py-5' : 'py-10'}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
      >
        <svg className="h-8 w-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V21h18v-4.5M12 3v13.5m-4.5-4.5L12 16.5l4.5-4.5" />
        </svg>
        <div className="text-center">
          <p className="font-medium text-zinc-200">
            {photos.length > 0 ? 'Add more photos' : 'Drag photos here, or click to select'}
          </p>
          {photos.length === 0 && (
            <p className="text-sm text-zinc-500 mt-1">All image formats · Sorted by date automatically</p>
          )}
        </div>
        <input
          type="file"
          multiple
          accept="image/*"
          className="sr-only"
          onChange={e => e.target.files && addFiles(Array.from(e.target.files))}
        />
      </label>

      {/* Google Photos import */}
      {isLoggedIn ? (
        <button
          onClick={handleGooglePhotos}
          disabled={pickerOpen || importing}
          className="w-full rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50 transition min-h-[44px]"
        >
          {pickerOpen ? 'Picker open…' : importing ? 'Downloading photos…' : 'Import from Google Photos'}
        </button>
      ) : (
        <Link
          href="/login"
          className="flex w-full items-center justify-center rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition min-h-[44px]"
        >
          Sign in to import from Google Photos
        </Link>
      )}

      {pickerError && (
        <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">{pickerError}</p>
      )}

      {/* Thumbnail preview — only show new (non-saved) photos here */}
      {photos.filter(p => p.source.kind !== 'saved').length > 0 && (
        <div className="space-y-2">
          {(() => {
            const newCount = photos.filter(p => p.source.kind !== 'saved').length
            const savedCount = photos.filter(p => p.source.kind === 'saved').length
            return (
              <p className="text-sm text-zinc-400">
                {newCount} new photo{newCount !== 1 ? 's' : ''}
                {savedCount > 0 ? ` · ${savedCount} from saved project` : ''}
                {' · sorted oldest first'}
              </p>
            )
          })()}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
            {photos.filter(p => p.source.kind !== 'saved').map(photo => (
              <div key={photo.id} className="relative group aspect-square overflow-hidden rounded-lg bg-zinc-900">
                <img
                  src={photo.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => dispatch({ type: 'REMOVE_PHOTO', id: photo.id })}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition"
                  aria-label="Remove photo"
                >
                  <svg className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
