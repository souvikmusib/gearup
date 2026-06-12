import { withSentryConfig } from '@sentry/nextjs';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Conservative CSP: allow self + inline (Next.js needs it for hydration
  // bootstrap), Sentry ingest, Vercel analytics. Tighten further once a
  // nonce-based CSP is wired through next.js.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-analytics.com https://*.sentry.io",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.vercel-analytics.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gearup/ui', '@gearup/types'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'jsonwebtoken'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  // Short-circuit /admin → /admin/dashboard at the edge so the client bundle
  // for the (auth-gated) AdminShell is never loaded just to perform a
  // redirect. Non-permanent so we can move the landing page later without
  // poisoning browser caches.
  async redirects() {
    return [
      { source: '/admin', destination: '/admin/dashboard', permanent: false },
    ];
  },
};

// withSentryConfig is a no-op when Sentry envs are not set; safe to always apply.
// Server/edge initialization additionally requires apps/web/instrumentation.ts
// (added alongside this change) under Next 14 App Router + @sentry/nextjs v8.
export default withSentryConfig(nextConfig, {
  silent: true,
  // Project/org are read from SENTRY_ORG / SENTRY_PROJECT env vars when
  // uploading sourcemaps; absent envs simply skip upload.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
