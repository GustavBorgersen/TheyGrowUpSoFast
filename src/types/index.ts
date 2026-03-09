export type Project = {
  id: string
  user_id: string
  name: string
  created_at: string
  settings: { maxProfileScore: number }
  reference_descriptor: number[] | null
  reference_photo_path: string | null
}

export type ProjectPhoto = {
  id: string
  project_id: string
  source: 'google_photos' | 'local'
  source_id: string | null
  source_meta: Record<string, unknown> | null
  thumbnail_path: string | null
  aligned_frame_path: string | null
  create_time: string
  order_index: number
  skipped: boolean
  skip_reason: string | null
  profile_score: number | null
  descriptor: number[] | null
}

export type ProcessingStatus =
  | 'idle'
  | 'loading-models'
  | 'detecting'
  | 'aligning'
  | 'encoding'
  | 'done'
  | 'error'

export type AlignResult = {
  canvas: HTMLCanvasElement
  descriptor: Float32Array
  profileScore: number
}

export type SkipReason = 'no_face' | 'profile_angle' | 'identity_mismatch'

export type GooglePhoto = {
  id: string
  baseUrl: string
  createTime: string
}

// ── Unified /create page types ──

export type PhotoSource =
  | { kind: 'local'; file: File }
  | { kind: 'google'; googleId: string; createTime: string }
  | { kind: 'saved'; projectPhotoId: string; supabasePath: string }

export type UnifiedPhoto = {
  id: string
  source: PhotoSource
  thumbnailUrl: string
  originalBlob: Blob
  createTime: number
  alignedBlob: Blob | null
  alignedThumbUrl: string | null
  descriptor: Float32Array | null
  profileScore: number | null
  skipReason: SkipReason | null
}

export type CreateStep = 'upload' | 'reference' | 'aligning' | 'review' | 'generate'

export type CreateState = {
  step: CreateStep
  photos: UnifiedPhoto[]
  referenceId: string | null
  referenceDescriptor: Float32Array | null
  referencePhotoBlob: Blob | null
  referencePhotoUrl: string | null
  profileThreshold: number
  alignProgress: { current: number; total: number } | null
  videoUrl: string | null
  error: string | null
  projectId: string | null
  projectName: string | null
}
