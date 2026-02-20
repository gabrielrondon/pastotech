import type { NextConfig } from 'next'

const baseConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
}

// Only apply next-pwa in production to avoid Turbopack/webpack conflict in dev
async function getConfig(): Promise<NextConfig> {
  if (process.env.NODE_ENV === 'production') {
    // @ts-expect-error next-pwa lacks types
    const withPWA = (await import('next-pwa')).default
    return withPWA({
      dest: 'public',
      register: true,
      skipWaiting: true,
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/api\.cowpro\.io\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            networkTimeoutSeconds: 10,
            expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
          },
        },
      ],
    })(baseConfig)
  }
  return baseConfig
}

export default getConfig()
