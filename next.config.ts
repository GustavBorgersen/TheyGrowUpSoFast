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
    return config
  },
}

export default nextConfig
