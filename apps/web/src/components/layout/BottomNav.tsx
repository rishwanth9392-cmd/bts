'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface NavLink {
  href: string;
  label: string;
  icon: ReactNode;
}

export function BottomNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-white pb-safe pt-1 sm:hidden">
      {links.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isActive ? 'text-status-info' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span className={isActive ? 'text-status-info' : 'text-gray-400'}>
              {link.icon}
            </span>
            <span className="text-[10px] font-medium">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
