'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface SidebarLink {
  href: string;
  label: string;
  icon: ReactNode;
}

export function Sidebar({ links, title = 'Admin Portal' }: { links: SidebarLink[]; title?: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-gray-200 bg-white sm:flex">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      </div>
      <nav className="flex-1 space-y-1 px-4 py-6 overflow-y-auto">
        {links.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-status-info-bg text-status-info'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className={isActive ? 'text-status-info' : 'text-gray-400'}>
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
