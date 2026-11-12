const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  reactStrictMode: true,
  // The app lives in frontend/ inside a monorepo with its own lockfile at the repo root.
  // Without this, Next guesses the workspace root from whichever lockfile it finds first.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
