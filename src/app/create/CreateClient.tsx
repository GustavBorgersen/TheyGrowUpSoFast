'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFaceApi } from '@/hooks/useFaceApi'
import type { CreateStep, UnifiedPhoto } from '@/types'
import { useCreateFlow } from './useCreateFlow'
import { AccordionStep } from './AccordionStep'
import { StepUpload } from './StepUpload'
import { StepReference } from './StepReference'
import { StepAlign } from './StepAlign'
import { StepReview } from './StepReview'
import { StepGenerate } from './StepGenerate'
import { ProjectPanel } from './ProjectPanel'

type Props = {
  user: { id: string; email?: string } | null
  initialProject?: {
    projectId: string
    projectName: string
    photos: UnifiedPhoto[]
  }
}

const STEPS: { key: CreateStep; title: string; number: number }[] = [
  { key: 'upload', title: 'Upload Photos', number: 1 },
  { key: 'reference', title: 'Pick Reference', number: 2 },
  { key: 'aligning', title: 'Align Faces', number: 3 },
  { key: 'review', title: 'Review & Filter', number: 4 },
  { key: 'generate', title: 'Generate Video', number: 5 },
]

export function CreateClient({ user, initialProject }: Props) {
  const router = useRouter()
  const { isLoaded: faceApiLoaded, error: faceApiError, faceApi } = useFaceApi()
  const runningRef = useRef(false)

  const initial = initialProject
    ? { step: 'review' as CreateStep, projectId: initialProject.projectId, projectName: initialProject.projectName, photos: initialProject.photos }
    : undefined

  const { state, dispatch } = useCreateFlow(initial)

  const isLoggedIn = !!user
  const handleAuthChange = useCallback(() => router.refresh(), [router])

  const [expandedSteps, setExpandedSteps] = useState<Set<CreateStep>>(
    () => new Set(initialProject ? ['review'] : ['upload'])
  )

  // Auto-expand when reducer changes step (e.g. START_ALIGNMENT, ALIGNMENT_DONE)
  useEffect(() => {
    setExpandedSteps(prev => {
      if (prev.has(state.step)) return prev
      const next = new Set(prev)
      next.add(state.step)
      return next
    })
  }, [state.step])

  const handleStepToggle = useCallback((step: CreateStep) => {
    // Block toggling aligning step while alignment is actively running
    if (step === 'aligning' && runningRef.current) return
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(step)) {
        next.delete(step)
      } else {
        next.add(step)
      }
      return next
    })
  }, [])

  const stepSubtitle = useCallback((step: CreateStep): string | undefined => {
    switch (step) {
      case 'upload': {
        const count = state.photos.filter(p => p.source.kind !== 'saved').length
        return count > 0 ? `${count} photos` : undefined
      }
      case 'reference': return state.referenceDescriptor
        ? 'Loaded from project'
        : state.referencePhotoUrl ? 'Selected' : undefined
      case 'review': {
        const aligned = state.photos.filter(p => p.alignedBlob && !p.skipReason).length
        return aligned > 0 ? `${aligned} aligned` : undefined
      }
      case 'generate': return state.videoUrl ? 'Done' : undefined
      default: return undefined
    }
  }, [state])

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</Link>
          <h1 className="text-3xl font-bold">Create a timelapse</h1>
        </div>

        {/* Project panel for logged-in users */}
        {isLoggedIn && (
          <ProjectPanel
            userId={user.id}
            projectId={state.projectId}
            projectName={state.projectName}
            photos={state.photos}
            referenceDescriptor={state.referenceDescriptor}
            referencePhotoBlob={state.referencePhotoBlob}
            dispatch={dispatch}
          />
        )}

        {/* Auth CTA for guests (compact) */}
        {!isLoggedIn && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-zinc-400">Sign in to save projects and import from Google Photos</p>
            <button
              onClick={() => {
                const popup = window.open('/login?next=/auth/popup-close', '_blank', 'popup,width=500,height=700')
                if (!popup) return
                const check = setInterval(() => {
                  if (popup.closed) { clearInterval(check); handleAuthChange() }
                }, 500)
              }}
              className="shrink-0 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition"
            >
              Sign in
            </button>
          </div>
        )}

        {faceApiError && (
          <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">
            Face detection failed to load: {faceApiError.message}
          </p>
        )}

        {state.error && (
          <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">{state.error}</p>
        )}

        {/* Accordion steps */}
        {STEPS.map(({ key, title, number }) => (
          <AccordionStep
            key={key}
            title={title}
            stepNumber={number}
            expanded={expandedSteps.has(key)}
            onToggle={() => handleStepToggle(key)}
            subtitle={stepSubtitle(key)}
          >
            {key === 'upload' && (
              <StepUpload
                photos={state.photos}
                dispatch={dispatch}
                isLoggedIn={isLoggedIn}
                onAuthChange={handleAuthChange}
              />
            )}

            {key === 'reference' && (
              <StepReference
                photos={state.photos}
                referenceId={state.referenceId}
                referencePhotoUrl={state.referencePhotoUrl}
                referenceDescriptor={state.referenceDescriptor}
                dispatch={dispatch}
                faceApi={faceApi}
                faceApiLoaded={faceApiLoaded}
              />
            )}

            {key === 'aligning' && (
              <StepAlign
                photos={state.photos}
                referenceDescriptor={state.referenceDescriptor}
                alignProgress={state.alignProgress}
                dispatch={dispatch}
                faceApi={faceApi}
                faceApiLoaded={faceApiLoaded}
                runningRef={runningRef}
              />
            )}

            {key === 'review' && (
              <StepReview
                photos={state.photos}
                profileThreshold={state.profileThreshold}
                dispatch={dispatch}
              />
            )}

            {key === 'generate' && (
              <StepGenerate
                photos={state.photos}
                profileThreshold={state.profileThreshold}
                videoUrl={state.videoUrl}
                dispatch={dispatch}
                projectName={state.projectName}
              />
            )}
          </AccordionStep>
        ))}

        {/* User info + sign out for logged-in users */}
        {isLoggedIn && (
          <div className="flex items-center justify-between pt-4 text-xs text-zinc-600">
            <span>{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="hover:text-zinc-400 transition">Sign out</button>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
