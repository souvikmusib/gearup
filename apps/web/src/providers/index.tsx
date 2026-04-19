'use client';
import { ThemeProvider } from '@/lib/theme/theme-context';
import { AuthProvider } from '@/lib/auth/auth-context';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
