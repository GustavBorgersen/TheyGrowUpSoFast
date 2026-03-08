'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useFaceApi } from '@/hooks/useFaceApi'
import { useVideoGenerator } from '@/hooks/useVideoGenerator'
import { useGooglePhotosPicker } from '@/hooks/useGooglePhotosPicker'
import { detectAndAlign } from '@/lib/faceAlign'
import { PhotoGrid } from '@/components/PhotoGrid'
import { ProcessingView } from '@/components/ProcessingView'
import { VideoPlayer } from '@/components/VideoPlayer'
import type { Project, ProjectPhoto, ProcessingStatus, SkipReason } from '@/types'

type SkippedPhoto = { name: string; reason: SkipReason }

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
  throw new Error('unreachable')
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

type Props = {
  project: Project
  initialPhotos: ProjectPhoto[]
  userId: string
}

export function ProjectClient({ project, initialPhotos, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const { isLoaded: faceApiLoaded, error: faceApiError, faceApi } = useFaceApi()
  const { generate, encodingProgress } = useVideoGenerator()
  const { openPicker, isOpen: pickerOpen, error: pickerError, tokenExpired } = useGooglePhotosPicker()

  const [photos, setPhotos] = useState<ProjectPhoto[]>(initialPhotos)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<ProcessingStatus>('idle')
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [skipped, setSkipped] = useState<SkippedPhoto[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [projectName, setProjectName] = useState(project.name)
  const [editingName, setEditingName] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Generate signed URLs for thumbnails (private bucket)
  useEffect(() => {
    const paths = photos
      .map(p => p.thumbnail_path)
      .filter((p): p is string => !!p && !thumbUrls[p])
    if (paths.length === 0) return

    supabase.storage.from('media').createSignedUrls(paths, 3600).then(({ data }) => {
      if (!data) return
      const newUrls: Record<string, string> = {}
      for (const item of data) {
        if (item.signedUrl && item.path) newUrls[item.path] = item.signedUrl
      }
      setThumbUrls(prev => ({ ...prev, ...newUrls }))
    })
  }, [photos])

  function getThumbnailUrl(path: string): string {
    return thumbUrls[path] ?? ''
  }

  async function getSignedUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from('media').createSignedUrl(path, 3600)
    if (error || !data) throw new Error('Failed to get signed URL')
    return data.signedUrl
  }

  async function handleAddPhotos() {
    if (!faceApi) {
      setErrorMsg('Face detection models are still loading. Please wait.')
      return
    }

    setErrorMsg(null)
    setSkipped([])

    let googlePhotos
    try {
      googlePhotos = await openPicker()
    } catch (err) {
      console.error('[handleAddPhotos] openPicker threw:', err)
      return
    }

    console.log('[addPhotos] picker returned', googlePhotos.length, 'photos')
    if (googlePhotos.length === 0) return

    // Get Google OAuth token — needed to download Picker mediaFile URLs
    const { data: { session } } = await supabase.auth.getSession()
    const providerToken = session?.provider_token ?? null
    if (!providerToken) {
      setErrorMsg('Google Photos access expired. Please sign in again.')
      return
    }

    // Find existing source IDs to avoid duplicates
    const existingIds = new Set(photos.map(p => p.source_id).filter(Boolean))
    const newPhotos = googlePhotos.filter(p => !existingIds.has(p.id))
    if (newPhotos.length === 0) {
      setErrorMsg('All selected photos are already in this project.')
      return
    }

    setStatus('detecting')
    setTotal(newPhotos.length)
    setCurrent(0)

    let reference: Float32Array | null = null
    const maxOrder = photos.reduce((max, p) => Math.max(max, p.order_index), -1)
    let orderIndex = maxOrder + 1

    // Process sequentially — shared canvas can't be used concurrently
    for (let i = 0; i < newPhotos.length; i++) {
      const googlePhoto = newPhotos[i]
      setCurrent(i + 1)
      let proxyUrl: string
      try {
        const res = await fetch('/api/proxy-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `${googlePhoto.baseUrl}=w2048`, token: providerToken }),
        })
        if (!res.ok) throw new Error(`Proxy failed: ${res.status}`)
        proxyUrl = URL.createObjectURL(await res.blob())
      } catch {
        setSkipped(prev => [...prev, { name: googlePhoto.id, reason: 'no_face' }])
        continue
      }

      let img: HTMLImageElement
      try {
        img = await loadImageFromUrl(proxyUrl)
      } catch {
        URL.revokeObjectURL(proxyUrl)
        setSkipped(prev => [...prev, { name: googlePhoto.id, reason: 'no_face' }])
        continue
      }

      if (!canvasRef.current) { URL.revokeObjectURL(proxyUrl); break }

      const ourId = crypto.randomUUID()
      const framePath = `frames/${userId}/${project.id}/${ourId}.jpg`
      const thumbPath = `thumbnails/${userId}/${project.id}/${ourId}.jpg`

      setStatus('aligning')
      const result = await detectAndAlign(
        faceApi,
        img,
        canvasRef.current,
        reference,
        project.settings.maxProfileScore
      )
      setStatus('detecting')
      URL.revokeObjectURL(proxyUrl)

      if (result.skipped) {
        setSkipped(prev => [...prev, { name: googlePhoto.id, reason: result.reason }])
        await supabase.from('project_photos').insert({
          id: ourId,
          project_id: project.id,
          source: 'google_photos',
          source_id: googlePhoto.id,
          source_meta: { createTime: googlePhoto.createTime },
          create_time: googlePhoto.createTime,
          order_index: orderIndex++,
          skipped: true,
          skip_reason: result.reason,
        })
        continue
      }

      if (reference === null) reference = result.descriptor

      // Snapshot the canvas before it gets reused for the next photo
      const snapshot = document.createElement('canvas')
      snapshot.width = result.canvas.width
      snapshot.height = result.canvas.height
      snapshot.getContext('2d')!.drawImage(result.canvas, 0, 0)

      const frameBlob = await new Promise<Blob>((res, rej) =>
        snapshot.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.85)
      )

      const thumbCanvas = document.createElement('canvas')
      const thumbH = Math.round(snapshot.height * (300 / snapshot.width))
      thumbCanvas.width = 300
      thumbCanvas.height = thumbH
      thumbCanvas.getContext('2d')!.drawImage(snapshot, 0, 0, 300, thumbH)
      const thumbBlob = await new Promise<Blob>((res, rej) =>
        thumbCanvas.toBlob(b => b ? res(b) : rej(new Error('thumb toBlob failed')), 'image/jpeg', 0.80)
      )

      await withRetry(() => supabase.storage.from('media').upload(framePath, frameBlob, { contentType: 'image/jpeg', upsert: true }).then(r => { if (r.error) throw r.error }))
      await withRetry(() => supabase.storage.from('media').upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: true }).then(r => { if (r.error) throw r.error }))

      const { data: insertedPhoto } = await supabase.from('project_photos').insert({
        id: ourId,
        project_id: project.id,
        source: 'google_photos',
        source_id: googlePhoto.id,
        source_meta: { createTime: googlePhoto.createTime },
        thumbnail_path: thumbPath,
        aligned_frame_path: framePath,
        create_time: googlePhoto.createTime,
        order_index: orderIndex++,
        skipped: false,
      }).select('*').single()

      if (insertedPhoto) {
        setPhotos(prev => [...prev, insertedPhoto as ProjectPhoto].sort((a, b) => (a.create_time ?? '').localeCompare(b.create_time ?? '')))
      }
    }

    setStatus('idle')
  }

  async function handleGenerateVideo() {
    const nonSkipped = photos.filter(p => !p.skipped && p.aligned_frame_path)
    if (nonSkipped.length === 0) {
      setErrorMsg('No aligned photos available to generate a video.')
      return
    }

    setStatus('encoding')
    setVideoUrl(null)
    setErrorMsg(null)

    try {
      // Get signed URLs for each frame
      const signedUrls = await Promise.all(nonSkipped.map(p => getSignedUrl(p.aligned_frame_path!)))

      // Load frames as canvases
      const frames: HTMLCanvasElement[] = []
      for (const url of signedUrls) {
        const img = await loadImageFromUrl(url)
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || img.width
        c.height = img.naturalHeight || img.height
        c.getContext('2d')!.drawImage(img, 0, 0)
        frames.push(c)
      }

      const blob = await generate(frames)
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Video encoding failed')
    }
  }

  async function handleRemovePhoto(photoId: string) {
    const photo = photos.find(p => p.id === photoId)
    if (!photo) return

    // Optimistic update
    setPhotos(prev => prev.filter(p => p.id !== photoId))

    // Delete storage files
    if (photo.aligned_frame_path) {
      await supabase.storage.from('media').remove([photo.aligned_frame_path])
    }
    if (photo.thumbnail_path) {
      await supabase.storage.from('media').remove([photo.thumbnail_path])
    }
    await supabase.from('project_photos').delete().eq('id', photoId)
  }

  async function handleDeleteProject() {
    const confirmed = window.confirm(`Delete project "${projectName}"? This cannot be undone.`)
    if (!confirmed) return

    // Delete all storage files
    const paths = [
      ...photos.map(p => p.aligned_frame_path).filter(Boolean) as string[],
      ...photos.map(p => p.thumbnail_path).filter(Boolean) as string[],
    ]
    if (paths.length > 0) {
      await supabase.storage.from('media').remove(paths)
    }
    await supabase.from('projects').delete().eq('id', project.id)
    router.push('/dashboard')
  }

  async function handleRename(newName: string) {
    if (!newName.trim() || newName === projectName) {
      setEditingName(false)
      return
    }
    setProjectName(newName)
    setEditingName(false)
    await supabase.from('projects').update({ name: newName.trim() }).eq('id', project.id)
  }

  const isProcessing = status === 'detecting' || status === 'aligning'

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300">← Dashboard</Link>
            {editingName ? (
              <input
                autoFocus
                defaultValue={projectName}
                onBlur={e => handleRename(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename(e.currentTarget.value)
                  if (e.key === 'Escape') setEditingName(false)
                }}
                className="block text-2xl font-bold bg-transparent border-b border-zinc-600 focus:outline-none focus:border-blue-500 text-white"
              />
            ) : (
              <h1
                className="text-2xl font-bold cursor-pointer hover:text-zinc-300"
                onClick={() => setEditingName(true)}
                title="Click to rename"
              >
                {projectName}
              </h1>
            )}
          </div>
          <button
            onClick={handleDeleteProject}
            className="text-sm text-zinc-600 hover:text-red-400 transition min-h-[44px] px-2"
          >
            Delete
          </button>
        </header>

        {/* Token expired banner */}
        {tokenExpired && (
          <div className="rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            Google Photos access expired.{' '}
            <button
              onClick={() => {
                const supabase = createClient()
                const origin = window.location.origin
                supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${origin}/auth/callback?next=/project/${project.id}`,
                    scopes: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
                    queryParams: { access_type: 'offline', prompt: 'select_account' },
                  },
                })
              }}
              className="underline hover:no-underline"
            >
              Click to reconnect →
            </button>
          </div>
        )}

        {pickerError && !tokenExpired && (
          <p className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {pickerError}
          </p>
        )}

        {faceApiError && (
          <p className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            Face detection failed to load: {faceApiError.message}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleAddPhotos}
            disabled={isProcessing || pickerOpen || !faceApiLoaded}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
          >
            {pickerOpen ? 'Picker open…' : isProcessing ? 'Processing…' : !faceApiLoaded ? 'Loading models…' : '+ Add photos'}
          </button>

          {photos.filter(p => !p.skipped).length > 0 && (
            <button
              onClick={handleGenerateVideo}
              disabled={status === 'encoding'}
              className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50 transition min-h-[44px]"
            >
              {status === 'encoding' ? 'Encoding…' : 'Generate video'}
            </button>
          )}
        </div>

        {/* First-photo hint */}
        {photos.length === 0 && (
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            The first photo sets the face. Pick your oldest photo first.
          </div>
        )}

        {/* Processing status */}
        {(isProcessing || status === 'encoding' || status === 'error') && (
          <ProcessingView
            status={status}
            current={current}
            total={total}
            encodingProgress={encodingProgress}
            skipped={skipped}
            error={errorMsg}
          />
        )}

        {/* Error message */}
        {errorMsg && status === 'idle' && (
          <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">{errorMsg}</p>
        )}

        {/* Photo grid */}
        <PhotoGrid
          photos={photos}
          getThumbnailUrl={getThumbnailUrl}
          onRemove={handleRemovePhoto}
        />

        {/* Video */}
        {status === 'done' && videoUrl && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Your timelapse</h2>
            <VideoPlayer src={videoUrl} filename={`${projectName.replace(/\s+/g, '-').toLowerCase()}.mp4`} />
          </div>
        )}
      </div>

      {/* Hidden shared canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </main>
  )
}
