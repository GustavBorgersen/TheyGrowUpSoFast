'use client'

import { useReducer } from 'react'
import type { CreateState, CreateStep, UnifiedPhoto, SkipReason } from '@/types'

type Action =
  | { type: 'ADD_PHOTOS'; photos: UnifiedPhoto[] }
  | { type: 'REMOVE_PHOTO'; id: string }
  | { type: 'SET_REFERENCE'; id: string; blob: Blob; url: string }
  | { type: 'CLEAR_REFERENCE' }
  | { type: 'START_ALIGNMENT' }
  | { type: 'ALIGN_PROGRESS'; current: number; total: number }
  | { type: 'PHOTO_ALIGNED'; id: string; alignedBlob: Blob; alignedThumbUrl: string; descriptor: Float32Array; profileScore: number }
  | { type: 'PHOTO_SKIPPED'; id: string; reason: SkipReason }
  | { type: 'ALIGNMENT_DONE' }
  | { type: 'SET_PROFILE_THRESHOLD'; value: number }
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
      if (photo?.alignedThumbUrl) URL.revokeObjectURL(photo.alignedThumbUrl)
      const photos = state.photos.filter(p => p.id !== action.id)
      const referenceId = state.referenceId === action.id ? null : state.referenceId
      const referenceDescriptor = referenceId === null ? null : state.referenceDescriptor
      let referencePhotoUrl = state.referencePhotoUrl
      let referencePhotoBlob = state.referencePhotoBlob
      if (referenceId === null) {
        if (referencePhotoUrl) URL.revokeObjectURL(referencePhotoUrl)
        referencePhotoUrl = null
        referencePhotoBlob = null
      }
      return { ...state, photos, referenceId, referenceDescriptor, referencePhotoBlob, referencePhotoUrl }
    }
    case 'SET_REFERENCE':
      if (state.referencePhotoUrl) URL.revokeObjectURL(state.referencePhotoUrl)
      return { ...state, referenceId: action.id, referencePhotoBlob: action.blob,
               referencePhotoUrl: action.url, error: null }
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
          ? { ...p, alignedBlob: action.alignedBlob, alignedThumbUrl: action.alignedThumbUrl, descriptor: action.descriptor, profileScore: action.profileScore, skipReason: null }
          : p
      )
      // If this is the reference photo, store descriptor
      const referenceDescriptor = action.id === state.referenceId ? action.descriptor : state.referenceDescriptor
      return { ...state, photos, referenceDescriptor }
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
      return { ...state, profileThreshold: action.value }
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
