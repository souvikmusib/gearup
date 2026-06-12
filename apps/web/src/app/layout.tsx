import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '@/styles/globals.css';
import { Providers } from '@/providers';

export const metadata: Metadata = {
  title: 'GearUp Servicing',
  description: 'Professional vehicle servicing management',
  icons: {
    icon: [
      { url: '/brand/gearup-mark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/gearup-mark-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/gearup-mark-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/brand/gearup-mark-192.png',
    shortcut: '/brand/gearup-mark-32.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
