import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  'aria-label': string; // Enforce accessibility
}

export function IconButton({ icon, className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-status-info focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
