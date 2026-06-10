// Next 14 App Router + @sentry/nextjs v8 require this file to bootstrap
// the server and edge SDKs. Without it, sentry.server.config.ts and
// sentry.edge.config.ts are never executed and server-side errors are not
// captured by Sentry.
//
// Client init is handled separately by sentry.client.config.ts (auto-loaded
// by @sentry/nextjs).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
