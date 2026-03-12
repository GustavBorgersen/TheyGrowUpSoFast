import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  headers: async () => [
    {
      // COOP must be 'same-origin-allow-popups' — 'same-origin' silently blocks the Google Photos picker popup
      source: '/(.*)',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
      ],
    },
  ],
  // Turbopack config (Next.js 16 default)
  turbopack: {},
  // Webpack config retained for `next build --webpack` and jest/CI environments
  webpack: (config) => {
    config.experiments = { asyncWebAssembly: true, layers: true }
    config.externals = [...(config.externals as unknown[] || []), { canvas: 'canvas' }]
    // Use face-api's nobundle build so it shares the npm-installed TF.js instance.
    // This lets @tensorflow/tfjs-backend-wasm register on the same TF.js that face-api uses.
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias || {}),
        '@vladmandic/face-api': '@vladmandic/face-api/dist/face-api.esm-nobundle.js',
      },
    }
    return config
  },
}

export default nextConfig
