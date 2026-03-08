'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useFaceApi } from '@/hooks/useFaceApi'
import { useVideoGenerator } from '@/hooks/useVideoGenerator'
import { detectAndAlign } from '@/lib/faceAlign'
import { ProcessingView } from '@/components/ProcessingView'
import { VideoPlayer } from '@/components/VideoPlayer'
import type { ProcessingStatus, SkipReason } from '@/types'

const MAX_PROFILE_SCORE = 0.4

type PhotoFile = {
  id: string
  file: File
  thumbnailUrl: string
  skipReason?: SkipReason  // set after generation if skipped
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load ${file.name}`)) }
    img.src = url
  })
}

export default function GuestPage() {
  const { isLoaded: faceApiLoaded, error: faceApiError, faceApi } = useFaceApi()
  const { generate, encodingProgress } = useVideoGenerator()

  const [photos, setPhotos] = useState<PhotoFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<ProcessingStatus>('idle')
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach(p => URL.revokeObjectURL(p.thumbnailUrl))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(incoming: File[]) {
    const imageFiles = incoming.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setPhotos(prev => {
      // Deduplicate by name + size
      const existingKeys = new Set(prev.map(p => `${p.file.name}-${p.file.size}`))
      const newEntries: PhotoFile[] = imageFiles
        .filter(f => !existingKeys.has(`${f.name}-${f.size}`))
        .map(f => ({ id: crypto.randomUUID(), file: f, thumbnailUrl: URL.createObjectURL(f) }))

      // Merge and sort by lastModified (oldest first)
      return [...prev, ...newEntries].sort((a, b) => a.file.lastModified - b.file.lastModified)
    })
  }

  function removePhoto(id: string) {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id)
      if (photo) URL.revokeObjectURL(photo.thumbnailUrl)
      return prev.filter(p => p.id !== id)
    })
  }

  async function generate_video() {
    if (!faceApi || photos.length === 0) return

    if (photos.length > 100) {
      const confirmed = window.confirm(
        `You have ${photos.length} photos. Processing this many may run out of memory on mobile. Continue?`
      )
      if (!confirmed) return
    }

    // Clear skip reasons from previous run
    setPhotos(prev => prev.map(p => ({ ...p, skipReason: undefined })))
    setStatus('detecting')
    setVideoUrl(null)
    setErrorMsg(null)
    setTotal(photos.length)
    setCurrent(0)

    const alignedFrames: HTMLCanvasElement[] = []
    let reference: Float32Array | null = null

    for (let i = 0; i < photos.length; i++) {
      setCurrent(i + 1)

      const markSkipped = (reason: SkipReason) => {
        setPhotos(prev => prev.map(p => p.id === photos[i].id ? { ...p, skipReason: reason } : p))
      }

      let img: HTMLImageElement
      try {
        img = await loadImage(photos[i].file)
      } catch {
        markSkipped('no_face')
        continue
      }

      if (!canvasRef.current) continue

      setStatus('aligning')
      try {
        const result = await detectAndAlign(faceApi, img, canvasRef.current, reference, MAX_PROFILE_SCORE)
        setStatus('detecting')

        if (result.skipped) {
          markSkipped(result.reason)
          continue
        }

        if (reference === null) reference = result.descriptor

        // Snapshot the shared canvas so it can be reused for the next frame
        const snapshot = document.createElement('canvas')
        snapshot.width = result.canvas.width
        snapshot.height = result.canvas.height
        snapshot.getContext('2d')!.drawImage(result.canvas, 0, 0)
        alignedFrames.push(snapshot)
      } catch (err) {
        console.error('[guest] align error:', err)
        markSkipped('no_face')
        setStatus('detecting')
      }
    }

    if (alignedFrames.length === 0) {
      setStatus('error')
      setErrorMsg('No faces were detected. Make sure faces are clearly visible and facing the camera.')
      return
    }

    setStatus('encoding')
    try {
      const blob = await generate(alignedFrames)
      setVideoUrl(URL.createObjectURL(blob))
      setStatus('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video encoding failed'
      const sabHint = typeof SharedArrayBuffer === 'undefined'
        ? ' Your browser may not support SharedArrayBuffer — try Chrome or Edge over HTTPS.'
        : ''
      setStatus('error')
      setErrorMsg(msg + sabHint)
    }
  }

  const isProcessing = status === 'detecting' || status === 'aligning' || status === 'encoding'

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">← Back</Link>
          <h1 className="text-3xl font-bold">Create a timelapse</h1>
          <p className="text-zinc-400">Upload photos and generate a face-aligned timelapse.</p>
        </div>

        {/* First-photo hint */}
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          The oldest photo sets the reference face. Make sure it has one face clearly visible and looking at the camera.
        </div>

        {/* Drop zone — visible whenever not actively processing */}
        {!isProcessing && (
          <label
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition cursor-pointer ${
              isDragging ? 'border-blue-500 bg-blue-950/20' : 'border-zinc-700 hover:border-zinc-500'
            } ${photos.length > 0 ? 'py-5' : 'py-12'}`}
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
        )}

        {/* Thumbnail grid */}
        {photos.length > 0 && !isProcessing && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">{photos.length} photo{photos.length !== 1 ? 's' : ''} · sorted oldest first</p>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
              {photos.map(photo => (
                <div key={photo.id} className={`relative group aspect-square overflow-hidden rounded-lg bg-zinc-900 ${photo.skipReason ? 'ring-2 ring-red-500/60' : ''}`}>
                  <img
                    src={photo.thumbnailUrl}
                    alt={photo.file.name}
                    loading="lazy"
                    className={`h-full w-full object-cover ${photo.skipReason ? 'opacity-40' : ''}`}
                  />
                  {photo.skipReason && (
                    <div className="absolute inset-x-0 bottom-0 bg-red-900/80 px-1 py-0.5 text-center">
                      <span className="text-[10px] leading-tight text-red-200">
                        {photo.skipReason === 'no_face' ? 'No face' : photo.skipReason === 'profile_angle' ? 'Profile' : 'Wrong person'}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition"
                    aria-label={`Remove ${photo.file.name}`}
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

        {/* Generate button */}
        {photos.length > 0 && !isProcessing && (
          <button
            onClick={generate_video}
            disabled={!faceApiLoaded}
            className="w-full rounded-xl bg-blue-600 py-4 text-base font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
          >
            {!faceApiLoaded ? 'Loading face detection…' : videoUrl ? `Regenerate (${photos.length} photos)` : `Generate timelapse (${photos.length} photos)`}
          </button>
        )}

        {faceApiError && (
          <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">
            Face detection failed to load: {faceApiError.message}
          </p>
        )}

        {/* Processing */}
        {isProcessing && (
          <ProcessingView
            status={status}
            current={current}
            total={total}
            encodingProgress={encodingProgress}
            skipped={[]}
          />
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="space-y-4">
            <ProcessingView
              status={status}
              current={current}
              total={total}
              encodingProgress={encodingProgress}
              skipped={[]}
              error={errorMsg}
            />
            <button
              onClick={() => setStatus('idle')}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 min-h-[44px]"
            >
              Try again
            </button>
          </div>
        )}

        {/* Done */}
        {status === 'done' && videoUrl && (
          <div className="space-y-6">
            <ProcessingView
              status={status}
              current={current}
              total={total}
              encodingProgress={encodingProgress}
              skipped={[]}
            />
            <VideoPlayer src={videoUrl} />
          </div>
        )}

        {/* Save CTA */}
        {status !== 'detecting' && status !== 'aligning' && status !== 'encoding' && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-5 text-center space-y-3">
            <p className="text-sm text-zinc-400">Want to save projects and pick from Google Photos?</p>
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition min-h-[44px]"
            >
              Create free account →
            </Link>
          </div>
        )}

        {/* Hidden shared canvas passed to faceAlign */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  )
}
