'use client'

type Props = {
  src: string
  filename?: string
}

export function VideoPlayer({ src, filename = 'timelapse.mp4' }: Props) {
  return (
    <div className="space-y-4">
      {/* iOS requires playsinline, otherwise video goes fullscreen */}
      <video
        src={src}
        controls
        playsInline
        muted
        className="w-full max-w-sm mx-auto rounded-xl bg-black"
        style={{ aspectRatio: '4/5' }}
      />
      <div className="flex justify-center">
        <a
          href={src}
          download={filename}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500 transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download MP4
        </a>
      </div>
    </div>
  )
}
