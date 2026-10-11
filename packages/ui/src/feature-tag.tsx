import type { ReactNode } from 'react';

interface FeatureTagProps {
  children: ReactNode;
  className?: string;
}

export function FeatureTag({ children, className = '' }: FeatureTagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-white/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm ${className}`}
    >
      {children}
    </span>
  );
}
