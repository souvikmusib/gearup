'use client';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-gray-800 pb-2 -mt-2 pt-2 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
