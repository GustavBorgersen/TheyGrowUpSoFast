'use client'

/**
 * Debug page for Phase 2 verification — delete after confirming:
 * 1. Face detection works (eyes level and centered)
 * 2. tf.getBackend() === 'webgl'
 * 3. FFmpeg encodes 3 static frames to MP4
 */

import { useRef, useState } from 'react'
import { useFaceApi } from '@/hooks/useFaceApi'
import { useVideoGenerator } from '@/hooks/useVideoGenerator'
import { detectAndAlign } from '@/lib/faceAlign'

export default function DebugPage() {
  const { isLoaded, error: faceApiError, faceApi } = useFaceApi()
  const { generate, encodingProgress, isEncoding } = useVideoGenerator()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [backendName, setBackendName] = useState<string | null>(null)

  function checkBackend() {
    if (!faceApi) { setStatus('face-api not loaded'); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tf = faceApi.tf as any
    const backend = tf.getBackend()
    setBackendName(backend)
    setStatus(`Backend: ${backend}`)
  }

  async function testAlign(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !faceApi || !canvasRef.current) return

    setStatus('Detecting...')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      URL.revokeObjectURL(url)
      try {
        // First detect to get a descriptor, then align against it
        const detection = await faceApi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
        if (!detection) { setStatus('No face detected'); return }
        const descriptor = new Float32Array(detection.descriptor)
        setStatus('Aligning...')
        const result = await detectAndAlign(faceApi, img, canvasRef.current!, descriptor)
        if (result.skipped) {
          setStatus(`Skipped: ${result.reason}`)
        } else {
          setStatus(`Aligned! Profile score: ${result.profileScore.toFixed(3)} | Backend: ${backendName}`)
        }
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    img.src = url
  }

  async function testEncode() {
    setStatus('Creating 3 test frames...')
    const frames: HTMLCanvasElement[] = []
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas')
      c.width = 1080; c.height = 1350
      const ctx = c.getContext('2d')!
      ctx.fillStyle = `hsl(${i * 120}, 50%, 30%)`
      ctx.fillRect(0, 0, 1080, 1350)
      ctx.fillStyle = 'white'
      ctx.font = '120px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`Frame ${i + 1}`, 540, 700)
      frames.push(c)
    }

    try {
      const blob = await generate(frames)
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      setStatus(`Encoded! Size: ${(blob.size / 1024).toFixed(0)}KB`)
    } catch (err) {
      setStatus(`Encode error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8 space-y-6">
      <h1 className="text-2xl font-bold">Debug — Phase 2 Verification</h1>

      <div className="space-y-2">
        <p className="text-sm text-zinc-400">
          face-api: {isLoaded ? '✅ loaded' : faceApiError ? `❌ ${faceApiError.message}` : '⏳ loading...'}
        </p>
        {isLoaded && (
          <button onClick={checkBackend} className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
            Check TF backend
          </button>
        )}
        {backendName && (
          <p className={`text-sm ${backendName === 'webgl' ? 'text-green-400' : 'text-yellow-400'}`}>
            Backend: {backendName} {backendName === 'webgl' ? '✅' : '⚠️ (expected webgl)'}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-zinc-400">Test face alignment:</p>
        <input
          type="file"
          accept="image/*"
          onChange={testAlign}
          disabled={!isLoaded}
          className="text-sm"
        />
        <canvas ref={canvasRef} className="border border-zinc-700 max-w-xs" />
      </div>

      <div className="space-y-2">
        <p className="text-sm text-zinc-400">Test FFmpeg encoding (3 solid-color frames):</p>
        <button
          onClick={testEncode}
          disabled={isEncoding}
          className="rounded bg-purple-800 px-4 py-2 text-sm hover:bg-purple-700 disabled:opacity-50"
        >
          {isEncoding ? `Encoding ${encodingProgress}%...` : 'Encode test video'}
        </button>
        {videoUrl && (
          <div className="space-y-2">
            <video src={videoUrl} controls playsInline muted className="max-w-xs" />
            <a href={videoUrl} download="debug.mp4" className="block text-sm text-blue-400 underline">
              Download debug.mp4
            </a>
          </div>
        )}
      </div>

      {status && <p className="text-sm text-zinc-300 font-mono">{status}</p>}
    </main>
  )
}
