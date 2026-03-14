'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

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

  // Listen for auth completion signalled by /auth/popup-close via localStorage.
  // This is COOP-safe: the popup reference itself gets severed when navigating
  // through Google's cross-origin pages, so popup.closed can fire too early.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'auth:popup-complete') {
        localStorage.removeItem('auth:popup-complete')
        router.refresh()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [router])

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
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Hero */}
      <section className="px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Watch them grow — <span className="text-blue-400">one photo at a time</span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base text-zinc-400">
          Upload photos of someone over the years. We align each face and turn them into a
          smooth timelapse video — all in your browser.
        </p>
        <div className="mx-auto mt-8 flex max-w-md justify-center gap-6 text-sm text-zinc-500">
          <span><span className="font-semibold text-zinc-300">1.</span> Upload</span>
          <span><span className="font-semibold text-zinc-300">2.</span> Align</span>
          <span><span className="font-semibold text-zinc-300">3.</span> Download</span>
        </div>
      </section>

      <div className="mx-auto max-w-2xl space-y-4 px-4 pb-12">
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
                window.open('/login?popup=1', '_blank', 'popup,width=500,height=700')
              }}
              className="shrink-0 flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition"
            >
              <GoogleIcon />
              Sign in with Google
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
