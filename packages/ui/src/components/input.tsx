'use client';
import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Additional classes merged after the base styles. */
  className?: string;
  /** Show error ring styling. */
  error?: boolean;
}

const base =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:outline-none dark:bg-gray-800 dark:text-white';

const normal = 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600';
const errored = 'border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-500';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={`${base} ${error ? errored : normal}${className ? ` ${className}` : ''}`}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
