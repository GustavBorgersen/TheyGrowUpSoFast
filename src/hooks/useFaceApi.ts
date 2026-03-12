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
        // Import face-api — it bundles its own TF build.
        const faceApi = await import('@vladmandic/face-api')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tf = faceApi.tf as any

        // Use WASM backend for deterministic fp32 math across all devices.
        // WebGL produces different landmarks on mobile vs desktop GPUs.
        const wasm = await import('@tensorflow/tfjs-backend-wasm')
        wasm.setWasmPaths('/wasm/')

        await tf.setBackend('wasm')
        await tf.ready()

        const backend = tf.getBackend()
        tfBackendInfo = `backend=${backend}`

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
