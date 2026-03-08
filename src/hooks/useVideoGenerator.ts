'use client'

import { useState, useRef } from 'react'

export function useVideoGenerator() {
  const [encodingProgress, setEncodingProgress] = useState(0)
  const [isEncoding, setIsEncoding] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const ffmpegRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null)

  async function generate(frames: HTMLCanvasElement[]): Promise<Blob> {
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

        ffmpeg.on('progress', ({ progress }) => {
          setEncodingProgress(Math.round(progress * 100))
        })

        ffmpegRef.current = ffmpeg
      }

      const ffmpeg = ffmpegRef.current

      // Write each frame as JPEG
      for (let i = 0; i < frames.length; i++) {
        const name = `frame_${String(i + 1).padStart(4, '0')}.jpg`
        const dataUrl = frames[i].toDataURL('image/jpeg', 0.85)
        const buf = await fetch(dataUrl).then(r => r.arrayBuffer())
        await ffmpeg.writeFile(name, new Uint8Array(buf))
      }

      // Encode
      await ffmpeg.exec([
        '-framerate', '1',
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
