import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ title, children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-gray-200 bg-white p-6 shadow-sm ${className}`}
    >
      {title && <h3 className="mb-3 text-lg font-semibold text-gray-900">{title}</h3>}
      <div className="text-gray-600">{children}</div>
    </div>
  );
}
