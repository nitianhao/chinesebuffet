const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  // Note: Trailing slash and query param redirects are handled in middleware.ts
  // for better dynamic control. Static redirects can be added here if needed.
  images: {
    domains: ['lh3.googleusercontent.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  webpack: (config, { isServer, dev }) => {
    // Fix for Leaflet in Next.js - only set fallbacks for client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }

    // Configure watchOptions to prevent EMFILE errors in dev mode
    if (dev) {
      config.watchOptions = config.watchOptions || {}
      const ignoredPatterns = [
        ...(Array.isArray(config.watchOptions.ignored) ? config.watchOptions.ignored : [config.watchOptions.ignored].filter(Boolean)),
        // Standard build/dependency directories
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '.next'),
        path.resolve(__dirname, 'dist'),
        path.resolve(__dirname, 'build'),
        // Exclude large directories to prevent EMFILE errors
        path.resolve(__dirname, 'Example JSON'),
        path.resolve(__dirname, 'Research'),
        path.resolve(__dirname, 'scripts'),
        path.resolve(__dirname, 'data'),
        path.resolve(__dirname, 'chinese-buffets'),
        path.resolve(__dirname, '.cursor'),
        // Regex patterns as fallback
        /[\\/]node_modules[\\/]/,
        /[\\/]\.next[\\/]/,
        /[\\/]dist[\\/]/,
        /[\\/]build[\\/]/,
        /[\\/]Example JSON[\\/]/,
        /[\\/]Research[\\/]/,
        /[\\/]scripts[\\/]/,
        /[\\/]data[\\/]/,
        /[\\/]chinese-buffets[\\/]/,
        /[\\/]\.cursor[\\/]/,
      ]
      config.watchOptions.ignored = ignoredPatterns
      // Use polling to reduce file handles (prevents EMFILE errors)
      config.watchOptions.poll = 1000 // Poll every 1 second
    }

    return config;
  },
}

module.exports = nextConfig
