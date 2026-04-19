import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import '@/styles/globals.css';
import { Providers } from '@/providers';

export const metadata: Metadata = {
  title: 'GearUp Servicing',
  description: 'Professional vehicle servicing management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
