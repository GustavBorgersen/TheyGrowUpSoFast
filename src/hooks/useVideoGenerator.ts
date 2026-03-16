'use client'

import { useState, useRef } from 'react'

// Frame-writing phase uses 0–75% of the progress bar.
// FFmpeg encoding phase uses 75–100%.
const WRITE_PROGRESS_END = 75

export function useVideoGenerator() {
  const [encodingProgress, setEncodingProgress] = useState(0)
  const [isEncoding, setIsEncoding] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const ffmpegRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null)

  async function generate(frames: HTMLCanvasElement[], frameDuration: number): Promise<Blob> {
    setIsEncoding(true)
    setEncodingProgress(0)
    setError(null)

    try {
      // Lazy-load FFmpeg
      if (!ffmpegRef.current) {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg')
        const ffmpeg = new FFmpeg()

        // Load from public/ffmpeg — must be local, not CDN, to work under COEP
        await ffmpeg.load({
          coreURL: '/ffmpeg/ffmpeg-core.js',
          wasmURL: '/ffmpeg/ffmpeg-core.wasm',
        })

        // FFmpeg reports progress against video duration — unreliable for short slideshows.
        // Map its 0–1 range to the encoding phase (WRITE_PROGRESS_END–100%).
        ffmpeg.on('progress', ({ progress }) => {
          const clamped = Math.min(1, Math.max(0, progress))
          setEncodingProgress(WRITE_PROGRESS_END + Math.round(clamped * (100 - WRITE_PROGRESS_END)))
        })

        ffmpegRef.current = ffmpeg
      }

      const ffmpeg = ffmpegRef.current

      // Write each frame as JPEG, reporting progress as 0–WRITE_PROGRESS_END
      for (let i = 0; i < frames.length; i++) {
        const name = `frame_${String(i + 1).padStart(4, '0')}.jpg`
        const dataUrl = frames[i].toDataURL('image/jpeg', 0.85)
        const buf = await fetch(dataUrl).then(r => r.arrayBuffer())
        await ffmpeg.writeFile(name, new Uint8Array(buf))
        setEncodingProgress(Math.round(((i + 1) / frames.length) * WRITE_PROGRESS_END))
      }

      // frameDuration is in seconds (0.5 step increments).
      // Express as fraction: frameDuration = N/2, so framerate = 2/N.
      const N = Math.round(frameDuration * 2)
      const framerate = `2/${N}`

      // Encode
      await ffmpeg.exec([
        '-framerate', framerate,
        '-i', 'frame_%04d.jpg',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', // critical: moves moov atom to front for streaming
        'output.mp4',
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await ffmpeg.readFile('output.mp4')) as any

      // Cleanup WASM filesystem
      for (let i = 0; i < frames.length; i++) {
        const name = `frame_${String(i + 1).padStart(4, '0')}.jpg`
        await ffmpeg.deleteFile(name).catch(() => {})
      }
      await ffmpeg.deleteFile('output.mp4').catch(() => {})

      setEncodingProgress(100)
      return new Blob([data], { type: 'video/mp4' })
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    } finally {
      setIsEncoding(false)
    }
  }

  return { generate, encodingProgress, isEncoding, error }
}
