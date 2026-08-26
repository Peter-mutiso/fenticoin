/** @type {import('next').NextConfig} */

const isDevelopment = process.env.NODE_ENV !== 'production';
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
];

// The realtime layer (`RealtimeProvider`) opens a WebSocket to the same API
// host — `connect-src` sources are scheme-sensitive, so an `http(s)://`
// entry alone does not also permit a `ws(s)://` connection to that same
// host, even though it's the identical origin's API. Without the
// WebSocket-scheme sibling here, every socket connection attempt is
// silently blocked by CSP, which then drives the client into a permanent
// reconnect loop (masking itself as "realtime just isn't connecting").
const apiWebSocketUrl = apiUrl?.startsWith('https://')
  ? `wss://${apiUrl.slice('https://'.length)}`
  : apiUrl?.startsWith('http://')
    ? `ws://${apiUrl.slice('http://'.length)}`
    : undefined;

const connectSrc = [
  "'self'",
  ...(apiUrl ? [apiUrl] : []),
  ...(apiWebSocketUrl ? [apiWebSocketUrl] : []),
];

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc.join(' ')}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src ${connectSrc.join(' ')}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,

  // Produces a minimal, self-contained server bundle for the portable
  // Docker/Linux-server deploy target (apps/web/Dockerfile sets
  // NEXT_OUTPUT_STANDALONE=true for its build stage). Off by default:
  // building it requires recreating pnpm's symlinked node_modules layout
  // via real symlinks, which needs elevated/Developer Mode permissions on
  // Windows and fails plain local/CI builds there — a host limitation, not
  // something relevant on Linux (where the container actually runs) or
  // on Vercel (which ignores this option entirely and does its own thing).
  output:
    process.env.NEXT_OUTPUT_STANDALONE === 'true'
      ? 'standalone'
      : undefined,

  eslint: {
    // Linting is handled by the workspace-wide `pnpm lint` (the root flat
    // ESLint config), which Next's own auto-detected lint step doesn't
    // know about — leaving this on would just run a second, differently
    // configured lint pass during every build.
    ignoreDuringBuilds: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;