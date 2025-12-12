/** @type {import('next').NextConfig} */
const nextConfig = {
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
}

module.exports = nextConfig

