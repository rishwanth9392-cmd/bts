import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';

const adminLinks = [
  { href: '/admin/dashboard', label: 'Overview', icon: <span className="text-xl">📊</span> },
  { href: '/admin/buses', label: 'Buses', icon: <span className="text-xl">🚍</span> },
  { href: '/admin/drivers', label: 'Drivers', icon: <span className="text-xl">👨‍✈️</span> },
  { href: '/admin/sos', label: 'Safety & SOS', icon: <span className="text-xl">🚨</span> },
  { href: '/admin/maintenance', label: 'Maintenance', icon: <span className="text-xl">🔧</span> },
  { href: '/admin/audit-logs', label: 'Audit Trail', icon: <span className="text-xl">🔒</span> },
  { href: '/admin/routes', label: 'Routes', icon: <span className="text-xl">🗺️</span> },
  { href: '/admin/fleet', label: 'Fleet Map', icon: <span className="text-xl">🚌</span> },
  { href: '/admin/reports', label: 'Reports', icon: <span className="text-xl">📈</span> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar links={adminLinks} title="BTS Admin" />
      {/* Mobile TopBar for Admin (Sidebar hides on mobile) */}
      <TopBar title="BTS Admin" className="sm:hidden" />
      
      <main className="flex-1 pt-16 sm:pl-64 sm:pt-0">
        <div className="mx-auto max-w-7xl p-8">{children}</div>
      </main>
    </div>
  );
}
