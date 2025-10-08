/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Für eigenen Server
  experimental: {
    outputFileTracingRoot: undefined
  }
}

module.exports = nextConfig
