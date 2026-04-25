import Link from 'next/link';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
          <Link prefetch={false} href="/" className="text-xl font-bold text-gray-900 dark:text-white">
            ⚙️ GearUp <span className="text-blue-600">Servicing</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link prefetch={false} href="/book-service" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">Book Service</Link>
            <Link prefetch={false} href="/track" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">Track Request</Link>
            <Link prefetch={false} href="/contact" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">Contact</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-200 dark:border-gray-800 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} GearUp Servicing. All rights reserved.
      </footer>
    </div>
  );
}
