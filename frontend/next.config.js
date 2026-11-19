const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // One list, shared with lib/imageHosts.ts (which decides when an avatar can be optimized).
    remotePatterns: require('./lib/imageHosts.json'),
  },
  reactStrictMode: true,
  // The app lives in frontend/ inside a monorepo with its own lockfile at the repo root.
  // Without this, Next guesses the workspace root from whichever lockfile it finds first.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),
};

/**
 * `npm run analyze` (ANALYZE=true, webpack build): writes the bundle treemaps to .next/analyze/
 * (NX-18, F-116). The analyzer is a devDependency, so it is required only when asked for: a
 * production install without dev dependencies never loads it.
 */
function withAnalyzer(config) {
  if (process.env.ANALYZE !== 'true') return config;
  const analyze = require('@next/bundle-analyzer')({ enabled: true, openAnalyzer: false });
  return analyze(config);
}

module.exports = withAnalyzer(nextConfig);
