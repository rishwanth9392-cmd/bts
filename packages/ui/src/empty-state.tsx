import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      {icon && <div className="mb-4 text-gray-400">{icon}</div>}
      <h3 className="mb-1 text-lg font-medium text-gray-900">{title}</h3>
      <p className="mb-6 text-sm text-gray-500">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
