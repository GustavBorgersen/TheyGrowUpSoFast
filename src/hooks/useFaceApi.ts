'use client'

import { useState, useEffect } from 'react'

// Module-level cache — loads once per browser session
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceApiInstance: any = null
export let tfBackendInfo: string = ''

export function useFaceApi() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Must be in useEffect — module-level import crashes SSR (window is undefined)
    if (faceApiInstance) {
      setIsLoaded(true)
      return
    }

    let mounted = true

    async function load() {
      try {
        // Import face-api only — it bundles its own TF build.
        // Do NOT also import @tensorflow/tfjs-backend-webgl; causes duplicate kernel registrations.
        const faceApi = await import('@vladmandic/face-api')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tf = faceApi.tf as any
        // Force 32-bit float textures — mobile GPUs default to fp16 which
        // degrades landmark precision, causing bad alignment transforms
        tf.env().set('WEBGL_FORCE_F16_TEXTURES', false)
        await tf.setBackend('webgl')
        await tf.ready()

        const f16 = tf.env().getBool('WEBGL_FORCE_F16_TEXTURES')
        const backend = tf.getBackend()
        tfBackendInfo = `backend=${backend} f16=${f16}`

        // Load models sequentially — reduces peak memory on mobile
        await faceApi.nets.ssdMobilenetv1.loadFromUri('/models')
        await faceApi.nets.faceLandmark68Net.loadFromUri('/models')
        await faceApi.nets.faceRecognitionNet.loadFromUri('/models')

        faceApiInstance = faceApi

        if (mounted) setIsLoaded(true)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err : new Error(String(err)))
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  return { isLoaded, error, faceApi: faceApiInstance }
}
