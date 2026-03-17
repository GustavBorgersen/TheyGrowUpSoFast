'use client'

import { useReducer } from 'react'
import type { CreateState, CreateStep, UnifiedPhoto, SkipReason, AlignSizeKey } from '@/types'

type Action =
  | { type: 'ADD_PHOTOS'; photos: UnifiedPhoto[] }
  | { type: 'REMOVE_PHOTO'; id: string }
  | { type: 'REMOVE_ALIGNED'; id: string }
  | { type: 'TOGGLE_PHOTO'; id: string; include: boolean }
  | { type: 'SET_REFERENCE'; id: string; blob: Blob; url: string; descriptor: Float32Array }
  | { type: 'CLEAR_REFERENCE' }
  | { type: 'START_ALIGNMENT' }
  | { type: 'ALIGN_PROGRESS'; current: number; total: number }
  | { type: 'PHOTO_ALIGNED'; id: string; alignedBlob: Blob; alignedThumbUrl: string; descriptor: Float32Array; profileScore: number; pitchScore: number }
  | { type: 'PHOTO_SKIPPED'; id: string; reason: SkipReason }
  | { type: 'ALIGNMENT_DONE' }
  | { type: 'SET_PROFILE_THRESHOLD'; value: number }
  | { type: 'SET_PITCH_THRESHOLD'; value: number }
  | { type: 'SET_ALIGN_SIZE'; size: AlignSizeKey }
  | { type: 'SET_VIDEO_URL'; url: string }
  | { type: 'SET_ERROR'; msg: string | null }
  | { type: 'SET_STEP'; step: CreateStep }
  | { type: 'LOAD_PROJECT'; projectId: string; projectName: string; photos: UnifiedPhoto[];
      referenceDescriptor: Float32Array | null;
      referencePhotoBlob: Blob | null; referencePhotoUrl: string | null }
  | { type: 'SET_PROJECT_ID'; id: string; name: string }
  | { type: 'RESET' }

function reducer(state: CreateState, action: Action): CreateState {
  switch (action.type) {
    case 'ADD_PHOTOS': {
      const existingIds = new Set(state.photos.map(p => p.id))
      const newPhotos = action.photos.filter(p => !existingIds.has(p.id))
      const merged = [...state.photos, ...newPhotos].sort((a, b) => a.createTime - b.createTime)
      return { ...state, photos: merged, error: null }
    }
    case 'REMOVE_PHOTO': {
      const photo = state.photos.find(p => p.id === action.id)
      if (!photo) return state

      // If photo has aligned data, convert to saved-like instead of deleting
      if (photo.alignedBlob) {
        // Revoke the upload thumbnail, keep the aligned one
        if (photo.thumbnailUrl && photo.thumbnailUrl !== photo.alignedThumbUrl) {
          URL.revokeObjectURL(photo.thumbnailUrl)
        }
        const photos = state.photos.map(p =>
          p.id === action.id
            ? { ...p, source: { kind: 'saved' as const, projectPhotoId: p.id, supabasePath: '' }, thumbnailUrl: p.alignedThumbUrl ?? p.thumbnailUrl }
            : p
        )
        return { ...state, photos }
      }

      // No aligned data — delete entirely
      if (photo.alignedThumbUrl) URL.revokeObjectURL(photo.alignedThumbUrl)
      const photos = state.photos.filter(p => p.id !== action.id)
      // Keep descriptor/blob/url — reference is still valid for alignment even if
      // the source photo is no longer in the upload list. Only clear the id link.
      const referenceId = state.referenceId === action.id ? null : state.referenceId
      return { ...state, photos, referenceId }
    }
    case 'REMOVE_ALIGNED': {
      const photos = state.photos.map(p =>
        p.id === action.id
          ? (() => {
              if (p.alignedThumbUrl) URL.revokeObjectURL(p.alignedThumbUrl)
              return { ...p, alignedBlob: null, alignedThumbUrl: null, descriptor: null, profileScore: null, pitchScore: null, skipReason: null, userOverride: null }
            })()
          : p
      )
      return { ...state, photos }
    }
    case 'TOGGLE_PHOTO': {
      const photos = state.photos.map(p =>
        p.id === action.id
          ? { ...p, userOverride: action.include ? 'include' as const : 'exclude' as const }
          : p
      )
      return { ...state, photos }
    }
    case 'SET_REFERENCE':
      if (state.referencePhotoUrl) URL.revokeObjectURL(state.referencePhotoUrl)
      return { ...state, referenceId: action.id, referencePhotoBlob: action.blob,
               referencePhotoUrl: action.url, referenceDescriptor: action.descriptor, error: null }
    case 'CLEAR_REFERENCE':
      if (state.referencePhotoUrl) URL.revokeObjectURL(state.referencePhotoUrl)
      return { ...state, referenceId: null, referencePhotoBlob: null,
               referencePhotoUrl: null, referenceDescriptor: null, error: null }
    case 'START_ALIGNMENT':
      return { ...state, step: 'aligning', alignProgress: { current: 0, total: 0 }, error: null, videoUrl: null }
    case 'ALIGN_PROGRESS':
      return { ...state, alignProgress: { current: action.current, total: action.total } }
    case 'PHOTO_ALIGNED': {
      const photos = state.photos.map(p =>
        p.id === action.id
          ? { ...p, alignedBlob: action.alignedBlob, alignedThumbUrl: action.alignedThumbUrl, descriptor: action.descriptor, profileScore: action.profileScore, pitchScore: action.pitchScore, skipReason: null }
          : p
      )
      return { ...state, photos }
    }
    case 'PHOTO_SKIPPED': {
      const photos = state.photos.map(p =>
        p.id === action.id ? { ...p, skipReason: action.reason } : p
      )
      return { ...state, photos }
    }
    case 'ALIGNMENT_DONE':
      return { ...state, step: 'review', alignProgress: null }
    case 'SET_PROFILE_THRESHOLD':
      return { ...state, profileThreshold: action.value,
               photos: state.photos.map(p => ({ ...p, userOverride: null })) }
    case 'SET_PITCH_THRESHOLD':
      return { ...state, pitchThreshold: action.value,
               photos: state.photos.map(p => ({ ...p, userOverride: null })) }
    case 'SET_ALIGN_SIZE':
      return { ...state, alignSize: action.size }
    case 'SET_VIDEO_URL':
      return { ...state, videoUrl: action.url, step: 'generate' }
    case 'SET_ERROR':
      return { ...state, error: action.msg }
    case 'SET_STEP':
      return { ...state, step: action.step, error: null }
    case 'LOAD_PROJECT':
      return {
        ...state,
        projectId: action.projectId,
        projectName: action.projectName,
        photos: [...action.photos].sort((a, b) => a.createTime - b.createTime),
        referenceDescriptor: action.referenceDescriptor,
        referencePhotoBlob: action.referencePhotoBlob,
        referencePhotoUrl: action.referencePhotoUrl,
        step: 'review',
        referenceId: null,
        error: null,
      }
    case 'SET_PROJECT_ID':
      return { ...state, projectId: action.id, projectName: action.name }
    case 'RESET':
      return createInitialState()
    default:
      return state
  }
}

function createInitialState(): CreateState {
  return {
    step: 'upload',
    photos: [],
    referenceId: null,
    referenceDescriptor: null,
    referencePhotoBlob: null,
    referencePhotoUrl: null,
    profileThreshold: 0.4,
    pitchThreshold: 0.3,
    alignSize: 'standard',
    alignProgress: null,
    videoUrl: null,
    error: null,
    projectId: null,
    projectName: null,
  }
}

export function useCreateFlow(initial?: Partial<CreateState>) {
  const [state, dispatch] = useReducer(reducer, { ...createInitialState(), ...initial })
  return { state, dispatch }
}

export type CreateDispatch = React.Dispatch<Action>
