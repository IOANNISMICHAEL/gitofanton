/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // web/ lives inside the monorepo; pin the root so Next doesn't pick a stray lockfile above it.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
}

export default nextConfig
