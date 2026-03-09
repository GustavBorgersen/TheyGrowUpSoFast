'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useFaceApi } from '@/hooks/useFaceApi'
import type { CreateStep, UnifiedPhoto } from '@/types'
import { useCreateFlow } from './useCreateFlow'
import { AccordionStep } from './AccordionStep'
import { AuthGate } from './AuthGate'
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

const STEP_ORDER: CreateStep[] = ['upload', 'reference', 'aligning', 'review', 'generate']

function stepIndex(step: CreateStep): number {
  return STEP_ORDER.indexOf(step)
}

export function CreateClient({ user, initialProject }: Props) {
  const { isLoaded: faceApiLoaded, error: faceApiError, faceApi } = useFaceApi()

  const initial = initialProject
    ? { step: 'review' as CreateStep, projectId: initialProject.projectId, projectName: initialProject.projectName, photos: initialProject.photos }
    : undefined

  const { state, dispatch } = useCreateFlow(initial)

  const isLoggedIn = !!user

  const canReachStep = useCallback((target: CreateStep): boolean => {
    const current = stepIndex(state.step)
    const targetIdx = stepIndex(target)

    // Can always go back to previous steps (except aligning)
    if (targetIdx < current && target !== 'aligning') return true
    // Current step is always reachable
    if (target === state.step) return true

    switch (target) {
      case 'upload': return true
      // Reference step not needed when descriptor already loaded from a saved project
      case 'reference': return state.photos.filter(p => p.source.kind !== 'saved').length > 0 && !state.referenceDescriptor
      case 'aligning': return (state.referenceId !== null || state.referenceDescriptor !== null) && faceApiLoaded
      case 'review': return state.photos.some(p => p.alignedBlob)
      case 'generate': return state.photos.some(p => p.alignedBlob && !p.skipReason)
      default: return false
    }
  }, [state, faceApiLoaded])

  const handleStepToggle = useCallback((step: CreateStep) => {
    if (step === 'aligning' && step !== state.step) return // can't manually enter aligning
    if (canReachStep(step)) {
      dispatch({ type: 'SET_STEP', step })
    }
  }, [state.step, canReachStep, dispatch])

  const handleStartAlignment = useCallback(() => {
    if ((!state.referenceId && !state.referenceDescriptor) || !faceApiLoaded) return
    dispatch({ type: 'START_ALIGNMENT' })
  }, [state.referenceId, state.referenceDescriptor, faceApiLoaded, dispatch])

  const newPhotoCount = state.photos.filter(p => p.source.kind !== 'saved').length

  const stepSubtitle = useCallback((step: CreateStep): string | undefined => {
    switch (step) {
      case 'upload': return newPhotoCount > 0 ? `${newPhotoCount} new photos` : undefined
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

  const includedCount = useMemo(() =>
    state.photos.filter(p =>
      p.alignedBlob && !p.skipReason &&
      (p.profileScore == null || p.profileScore <= state.profileThreshold)
    ).length,
    [state.photos, state.profileThreshold]
  )

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
            <Link
              href="/login"
              className="shrink-0 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition"
            >
              Sign in
            </Link>
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
            expanded={state.step === key}
            disabled={!canReachStep(key)}
            onToggle={() => handleStepToggle(key)}
            subtitle={stepSubtitle(key)}
          >
            {key === 'upload' && (
              <div className="space-y-4">
                <StepUpload
                  photos={state.photos}
                  dispatch={dispatch}
                  isLoggedIn={isLoggedIn}
                />
                {/* When a reference is already loaded (saved project), skip reference step */}
                {state.referenceDescriptor && newPhotoCount > 0 && (
                  <button
                    onClick={handleStartAlignment}
                    disabled={!faceApiLoaded}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
                  >
                    {!faceApiLoaded ? 'Loading face detection...' : `Align ${newPhotoCount} new photo${newPhotoCount !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            )}

            {key === 'reference' && (
              <div className="space-y-4">
                <StepReference
                  photos={state.photos}
                  referenceId={state.referenceId}
                  referencePhotoUrl={state.referencePhotoUrl}
                  dispatch={dispatch}
                />
                {state.referenceId && (
                  <button
                    onClick={handleStartAlignment}
                    disabled={!faceApiLoaded}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]"
                  >
                    {!faceApiLoaded ? 'Loading face detection...' : 'Start alignment'}
                  </button>
                )}
              </div>
            )}

            {key === 'aligning' && (
              <StepAlign
                photos={state.photos}
                referenceId={state.referenceId}
                referenceDescriptor={state.referenceDescriptor}
                alignProgress={state.alignProgress}
                dispatch={dispatch}
                faceApi={faceApi}
              />
            )}

            {key === 'review' && (
              <div className="space-y-4">
                <StepReview
                  photos={state.photos}
                  profileThreshold={state.profileThreshold}
                  dispatch={dispatch}
                  onAddMore={() => dispatch({ type: 'SET_STEP', step: 'upload' })}
                />
                {/* Save button for logged-in users */}
                {isLoggedIn && state.photos.some(p => p.alignedBlob && p.source.kind !== 'saved') && (
                  <AuthGate isLoggedIn={isLoggedIn} message="Sign in to save">
                    <p className="text-xs text-zinc-500">Use the Projects panel above to save your work.</p>
                  </AuthGate>
                )}
                {includedCount > 0 && (
                  <button
                    onClick={() => dispatch({ type: 'SET_STEP', step: 'generate' })}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition min-h-[44px]"
                  >
                    Continue to generate ({includedCount} photos)
                  </button>
                )}
              </div>
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
