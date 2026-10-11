'use client';

import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';

const studentLinks = [
  { href: '/student/dashboard', label: 'Home', icon: <span className="text-xl">🏠</span> },
  { href: '/student/routes', label: 'Routes', icon: <span className="text-xl">🗺️</span> },
  { href: '/student/map', label: 'Track', icon: <span className="text-xl">📍</span> },
  { href: '/student/boarding', label: 'Boarding', icon: <span className="text-xl">🎟️</span> },
  { href: '/student/notifications', label: 'Alerts', icon: <span className="text-xl">🔔</span> },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTracking = pathname === '/student/dashboard' || pathname === '/student/map';

  if (isTracking) {
    return <div className="h-screen w-screen overflow-hidden bg-slate-950">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <TopBar title="BTS Student" />
      <main className="flex-1 pb-16 pt-16 sm:pb-0">{children}</main>
      <BottomNav links={studentLinks} />
    </div>
  );
}
