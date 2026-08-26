/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@didit-protocol/sdk-web'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Enable automatic image optimization (default: true)
    // Next.js automatically converts images to WebP/AVIF when supported
    formats: ['image/avif', 'image/webp'],
    // Remote patterns for external images (Google profile photos)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
  env: {
    // Version marker - Vercel automatically sets VERCEL_GIT_COMMIT_SHA
    // This makes it available at build time
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
  },
}

module.exports = nextConfig

