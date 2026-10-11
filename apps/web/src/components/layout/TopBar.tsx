import type { ReactNode } from 'react';
import { NotificationsBell } from '@/components/NotificationsBell';

interface TopBarProps {
  title: string;
  actions?: ReactNode;
  className?: string;
}

export function TopBar({ title, actions, className = '' }: TopBarProps) {
  return (
    <header className={`fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm sm:px-6 lg:px-8 ${className}`}>
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3">
        {actions}
        <NotificationsBell />
      </div>
    </header>
  );
}
