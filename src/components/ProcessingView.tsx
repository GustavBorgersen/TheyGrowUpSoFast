'use client'

import type { ProcessingStatus, SkipReason } from '@/types'

type SkippedPhoto = {
  name: string
  reason: SkipReason
}

type Props = {
  status: ProcessingStatus
  current: number
  total: number
  encodingProgress: number
  skipped: SkippedPhoto[]
  error?: string | null
}

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  idle: 'Ready',
  'loading-models': 'Loading face detection models…',
  detecting: 'Detecting faces…',
  aligning: 'Aligning faces…',
  encoding: 'Encoding video…',
  done: 'Done!',
  error: 'Something went wrong',
}

const SKIP_LABELS: Record<SkipReason, string> = {
  no_face: 'No face detected',
  profile_angle: 'Face at profile angle',
  identity_mismatch: 'Different person',
  timeout: 'Timed out',
  error: 'Processing error',
}

export function ProcessingView({ status, current, total, encodingProgress, skipped, error }: Props) {
  const isProcessing = status !== 'idle' && status !== 'done' && status !== 'error'
  const showFrameProgress = (status === 'detecting' || status === 'aligning') && total > 0
  const showEncodingProgress = status === 'encoding'

  return (
    <div className="space-y-4">
      {/* Status label */}
      <div className="flex items-center gap-3">
        {isProcessing && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
        )}
        <span className={`text-sm font-medium ${status === 'error' ? 'text-red-400' : status === 'done' ? 'text-green-400' : 'text-zinc-200'}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Frame progress */}
      {showFrameProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Frame {current} of {total}</span>
            <span>{Math.round((current / total) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-blue-500 transition-all duration-200"
              style={{ width: `${(current / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Encoding progress */}
      {showEncodingProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Encoding video…</span>
            <span>{encodingProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-purple-500 transition-all duration-200"
              style={{ width: `${encodingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      {/* Skipped photos */}
      {skipped.length > 0 && (
        <details className="rounded-lg bg-zinc-900 px-4 py-3">
          <summary className="cursor-pointer text-sm text-zinc-400">
            {skipped.length} photo{skipped.length !== 1 ? 's' : ''} skipped
          </summary>
          <ul className="mt-2 space-y-1">
            {skipped.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-xs text-zinc-500">
                <span className="truncate max-w-[60%]">{s.name}</span>
                <span className="text-zinc-600">{SKIP_LABELS[s.reason]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
