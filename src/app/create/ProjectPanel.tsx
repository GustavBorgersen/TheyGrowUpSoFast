'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UnifiedPhoto, Project } from '@/types'
import type { CreateDispatch } from './useCreateFlow'

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

type Props = {
  userId: string
  projectId: string | null
  projectName: string | null
  photos: UnifiedPhoto[]
  referenceDescriptor: Float32Array | null
  referencePhotoBlob: Blob | null
  dispatch: CreateDispatch
}

export function ProjectPanel({ userId, projectId, projectName, photos, referenceDescriptor, referencePhotoBlob, dispatch }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setProjects(data as Project[])
  }, [supabase])

  const handleToggle = useCallback(async () => {
    if (!expanded) {
      await loadProjects()
    }
    setExpanded(prev => !prev)
  }, [expanded, loadProjects])

  const handleLoadProject = useCallback(async (project: Project) => {
    setLoading(true)
    setError(null)
    try {
      // Fetch project record (has reference_descriptor) and photos together
      const [{ data: projectData }, { data: dbPhotos }] = await Promise.all([
        supabase.from('projects').select('reference_descriptor, reference_photo_path').eq('id', project.id).single(),
        supabase.from('project_photos').select('*').eq('project_id', project.id).order('create_time', { ascending: true }),
      ])

      const referenceDescriptor = projectData?.reference_descriptor
        ? new Float32Array(projectData.reference_descriptor)
        : null

      let referencePhotoBlob: Blob | null = null
      let referencePhotoUrl: string | null = null
      if (projectData?.reference_photo_path) {
        try {
          const { data: refUrls } = await supabase.storage.from('media')
            .createSignedUrls([projectData.reference_photo_path], 3600)
          const refUrl = refUrls?.[0]?.signedUrl
          if (refUrl) {
            const res = await fetch(refUrl)
            referencePhotoBlob = await res.blob()
            referencePhotoUrl = URL.createObjectURL(referencePhotoBlob)
          }
        } catch {
          // Proceed without reference photo — descriptor still enables alignment
        }
      }

      if (!dbPhotos || dbPhotos.length === 0) {
        dispatch({ type: 'LOAD_PROJECT', projectId: project.id, projectName: project.name,
                   photos: [], referenceDescriptor, referencePhotoBlob, referencePhotoUrl })
        setExpanded(false)
        setLoading(false)
        return
      }

      // Download only aligned frames (no thumbnails stored — generate them from the frame)
      const alignedPaths = dbPhotos
        .filter(p => p.aligned_frame_path && !p.skipped)
        .map(p => p.aligned_frame_path as string)

      const { data: signedUrls } = alignedPaths.length > 0
        ? await supabase.storage.from('media').createSignedUrls(alignedPaths, 3600)
        : { data: [] }

      const signedUrlMap = new Map<string, string>()
      for (const item of signedUrls ?? []) {
        if (item.signedUrl && item.path) signedUrlMap.set(item.path, item.signedUrl)
      }

      const unifiedPhotos: UnifiedPhoto[] = []
      for (const dbPhoto of dbPhotos) {
        let alignedBlob: Blob | null = null
        let alignedThumbUrl: string | null = null

        if (dbPhoto.aligned_frame_path && !dbPhoto.skipped) {
          const url = signedUrlMap.get(dbPhoto.aligned_frame_path)
          if (url) {
            try {
              const res = await fetch(url)
              alignedBlob = await res.blob()

              // Generate thumbnail client-side from the aligned frame
              const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image()
                const objUrl = URL.createObjectURL(alignedBlob!)
                el.onload = () => { URL.revokeObjectURL(objUrl); resolve(el) }
                el.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('load failed')) }
                el.src = objUrl
              })
              const thumbCanvas = document.createElement('canvas')
              const thumbH = Math.round(img.height * (300 / img.width))
              thumbCanvas.width = 300
              thumbCanvas.height = thumbH
              thumbCanvas.getContext('2d')!.drawImage(img, 0, 0, 300, thumbH)
              const thumbBlob = await new Promise<Blob>((res, rej) =>
                thumbCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.80)
              )
              alignedThumbUrl = URL.createObjectURL(thumbBlob)
            } catch {
              // skip failed downloads
            }
          }
        }

        unifiedPhotos.push({
          id: dbPhoto.id,
          source: { kind: 'saved', projectPhotoId: dbPhoto.id, supabasePath: dbPhoto.aligned_frame_path ?? '' },
          thumbnailUrl: alignedThumbUrl ?? '',
          originalBlob: alignedBlob ?? new Blob(),
          createTime: new Date(dbPhoto.create_time).getTime(),
          alignedBlob,
          alignedThumbUrl,
          descriptor: dbPhoto.descriptor ? new Float32Array(dbPhoto.descriptor) : null,
          profileScore: dbPhoto.profile_score,
          skipReason: dbPhoto.skipped ? (dbPhoto.skip_reason as UnifiedPhoto['skipReason']) : null,
        })
      }

      dispatch({ type: 'LOAD_PROJECT', projectId: project.id, projectName: project.name,
                 photos: unifiedPhotos, referenceDescriptor, referencePhotoBlob, referencePhotoUrl })
      setExpanded(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [supabase, dispatch])

  const handleDeleteProject = useCallback(async (p: Project) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return

    setError(null)
    try {
      // Remove storage files for this project
      const [{ data: dbPhotos }, { data: projectRecord }] = await Promise.all([
        supabase.from('project_photos').select('aligned_frame_path').eq('project_id', p.id),
        supabase.from('projects').select('reference_photo_path').eq('id', p.id).single(),
      ])

      const paths = (dbPhotos ?? []).map(ph => ph.aligned_frame_path).filter(Boolean) as string[]
      if (projectRecord?.reference_photo_path) paths.push(projectRecord.reference_photo_path)
      if (paths.length > 0) {
        await supabase.storage.from('media').remove(paths)
      }

      await supabase.from('projects').delete().eq('id', p.id)
      setProjects(prev => prev.filter(x => x.id !== p.id))

      // If we deleted the currently loaded project, clear it
      if (p.id === projectId) {
        dispatch({ type: 'RESET' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    }
  }, [supabase, projectId, dispatch])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)

    try {
      let pid = projectId
      let pName = projectName

      // Create new project if needed
      if (!pid) {
        if (!newName.trim()) {
          setShowNewForm(true)
          setSaving(false)
          return
        }
        pName = newName.trim()
        const { data, error } = await supabase
          .from('projects')
          .insert({ name: pName, user_id: userId })
          .select('id')
          .single()
        if (error || !data) throw new Error(error?.message ?? 'Failed to create project')
        pid = data.id
        dispatch({ type: 'SET_PROJECT_ID', id: pid!, name: pName! })
        setShowNewForm(false)
        setNewName('')
      }

      // Save reference descriptor to the project row
      if (referenceDescriptor) {
        await supabase.from('projects')
          .update({ reference_descriptor: Array.from(referenceDescriptor) })
          .eq('id', pid)
      }

      // Upload reference photo blob
      if (referencePhotoBlob) {
        const refPath = `references/${userId}/${pid}/ref.jpg`
        await withRetry(() =>
          supabase.storage.from('media')
            .upload(refPath, referencePhotoBlob, { contentType: 'image/jpeg', upsert: true })
            .then(r => { if (r.error) throw r.error })
        )
        await supabase.from('projects').update({ reference_photo_path: refPath }).eq('id', pid)
      }

      // Upload only aligned frames for new (non-saved) photos
      const toUpload = photos.filter(p => p.alignedBlob && p.source.kind !== 'saved' && !p.skipReason)

      for (const photo of toUpload) {
        const framePath = `frames/${userId}/${pid}/${photo.id}.jpg`

        await withRetry(() =>
          supabase.storage.from('media').upload(framePath, photo.alignedBlob!, { contentType: 'image/jpeg', upsert: true })
            .then(r => { if (r.error) throw r.error })
        )

        const descriptorArray = photo.descriptor ? Array.from(photo.descriptor) : null
        await supabase.from('project_photos').upsert({
          id: photo.id,
          project_id: pid,
          source: photo.source.kind === 'google' ? 'google_photos' : 'local',
          source_id: photo.source.kind === 'google' ? photo.source.googleId : null,
          aligned_frame_path: framePath,
          create_time: new Date(photo.createTime).toISOString(),
          order_index: photos.indexOf(photo),
          skipped: false,
          profile_score: photo.profileScore,
          descriptor: descriptorArray,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project')
    } finally {
      setSaving(false)
    }
  }, [projectId, projectName, newName, photos, referenceDescriptor, referencePhotoBlob, userId, supabase, dispatch])

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-medium text-zinc-300">
          {projectName ? `Project: ${projectName}` : 'Projects'}
        </span>
        <svg
          className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-4">
          {error && <p className="text-sm text-red-400">{error}</p>}

          {loading && <p className="text-sm text-zinc-400">Loading project...</p>}

          {/* Save current work */}
          {photos.some(p => p.alignedBlob && p.source.kind !== 'saved') && (
            <div className="space-y-2">
              {!projectId && showNewForm && (
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Project name"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              )}
              <button
                onClick={handleSave}
                disabled={saving || (showNewForm && !newName.trim())}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
              >
                {saving ? 'Saving...' : projectId ? 'Save changes' : 'Save as new project'}
              </button>
            </div>
          )}

          {/* Project list */}
          {!loading && projects.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Your projects</p>
              {projects.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center gap-1 rounded-lg ${p.id === projectId ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'} transition`}
                >
                  <button
                    onClick={() => handleLoadProject(p)}
                    disabled={loading}
                    className={`flex-1 min-w-0 text-left px-3 py-2 text-sm ${p.id === projectId ? 'text-blue-400' : 'text-zinc-300'}`}
                  >
                    <span className="truncate block">{p.name}</span>
                    <span className="text-xs text-zinc-600">{new Date(p.created_at).toLocaleDateString()}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteProject(p)}
                    className="shrink-0 px-2 py-2 text-zinc-600 hover:text-red-400 transition"
                    aria-label={`Delete ${p.name}`}
                    title="Delete project"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {!loading && projects.length === 0 && (
            <p className="text-sm text-zinc-500">No saved projects yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
