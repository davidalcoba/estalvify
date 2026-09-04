import type { NextConfig } from "next";

// Content-Security-Policy. Kept intentionally conservative: Next.js injects inline
// bootstrap scripts and inline styles, so a nonce-based strict CSP would need
// request-time nonce plumbing through the proxy — deferred. Even so this locks
// down object/base/form-action, pins frame-ancestors (matching X-Frame-Options),
// and bounds where scripts, styles, images and connections may come from.
// `img-src https:` allows the Google account avatar; the OAuth flow is a
// top-level navigation, so it needs no frame/connect allowance here.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Required for Prisma in Next.js serverless
  serverExternalPackages: ["@prisma/client", "prisma"],

  // Keep `sharp` out of the deployed bundles. It is in the tree only because
  // Next.js declares it for image optimization and because
  // `scripts/generate-icons.mjs` rasterizes with it locally — the app imports
  // `next/image` nowhere, and on Vercel image optimization is a platform
  // service, so no function ever loads it. File tracing pulled it in anyway,
  // and it is not small: the two `libvips` builds (glibc *and* musl, only one
  // of which could ever run) plus the bindings are ~33 MB, copied into every
  // one of the ~39 route functions. Measured on this tree, excluding it takes
  // the deployment's function bundles from ~1795 MB to ~506 MB, which matters
  // because Vercel's Function Storage quota accumulates over *every*
  // deployment ever kept, not just the live one.
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**"],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        // Allow service worker scope
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
