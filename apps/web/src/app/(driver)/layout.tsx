import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { OfflineBanner } from '@/components/driver/OfflineBanner';

const baseDriverLinks = [
  { href: '/driver/dashboard', label: 'Home', icon: <span className="text-xl">🏠</span> },
  { href: '/driver/trip', label: 'Trip', icon: <span className="text-xl">🚌</span> },
  { href: '/driver/occupancy', label: 'Count', icon: <span className="text-xl">👥</span> },
  { href: '/driver/emergency', label: 'SOS', icon: <span className="text-xl">🚨</span> },
];

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV !== 'production';
  const driverLinks = isDev
    ? [
        ...baseDriverLinks,
        { href: '/driver/simulator', label: 'Sim', icon: <span className="text-xl">🧪</span> },
      ]
    : baseDriverLinks;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <TopBar title="BTS Driver Console" />
      <OfflineBanner />
      <main className="flex-1 pb-16 pt-16 sm:pb-0">{children}</main>
      <BottomNav links={driverLinks} />
    </div>
  );
}
