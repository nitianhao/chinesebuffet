const fs = require('fs')
const path = require('path')

// #region agent log
const LOG_ENDPOINT = 'http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a'
const sessionId = 'debug-session'
const runId = 'run3'
const targetPath = path.join(__dirname, 'node_modules', 'next', 'dist', 'client', 'components', 'router-reducer', 'create-href-from-url.js')
const patchedPath = path.join(__dirname, 'patches', 'create-href-from-url.js')

const sendLog = (hypothesisId, message, data) => {
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      runId,
      hypothesisId,
      location: 'next.config.js',
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
}

try {
  const stat = fs.lstatSync(targetPath)
  sendLog('H1', 'target lstat', {
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    isSymbolicLink: stat.isSymbolicLink(),
    size: stat.size,
  })
} catch (error) {
  sendLog('H1', 'target lstat error', { error: String(error) })
}

try {
  fs.accessSync(targetPath, fs.constants.R_OK)
  sendLog('H1', 'access check', { readable: true })
} catch (error) {
  sendLog('H1', 'access check error', { error: String(error) })
}

try {
  const contentProbe = fs.readFileSync(targetPath, 'utf8').slice(0, 40)
  sendLog('H1', 'readFile probe', { ok: true, snippet: contentProbe })
} catch (error) {
  sendLog('H1', 'readFile probe error', { error: String(error) })
}

try {
  const patchedProbe = fs.readFileSync(patchedPath, 'utf8').slice(0, 40)
  sendLog('H4', 'patched readFile probe', { ok: true, snippet: patchedProbe })
} catch (error) {
  sendLog('H4', 'patched readFile probe error', { error: String(error) })
}

sendLog('H2', 'process context', {
  cwd: process.cwd(),
  node: process.version,
  platform: process.platform,
  pid: process.pid,
  uid: process.getuid?.(),
  gid: process.getgid?.(),
})

sendLog('H3', 'project layout', {
  hasNestedProject: fs.existsSync(path.join(__dirname, 'chinese-buffets', 'package.json')),
  rootPackage: (function () {
    try {
      const pkg = require('./package.json')
      return { name: pkg.name, devScript: pkg.scripts?.dev }
    } catch (error) {
      return { error: String(error) }
    }
  })(),
})
// #endregion

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

    config.resolve.alias = {
      ...config.resolve.alias,
      [path.join('next/dist/client/components/router-reducer/create-href-from-url.js')]: patchedPath,
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
      // #region agent log
      sendLog('H5', 'watchOptions configured in webpack', {
        ignoredCount: ignoredPatterns.length,
        hasAbsolutePaths: ignoredPatterns.some(p => typeof p === 'string' && path.isAbsolute(p)),
        hasRegex: ignoredPatterns.some(p => p instanceof RegExp),
        polling: config.watchOptions.poll,
        dev,
        isServer,
      })
      // #endregion
    }

    return config;
  },
}

module.exports = nextConfig

