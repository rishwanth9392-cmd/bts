import { notFound } from 'next/navigation';
import { getRouteById } from '@/services/student.service';
import { RouteStopsView } from '@/components/routes/RouteStopsView';

export const dynamic = 'force-dynamic';

interface RouteDetailsPageProps {
  params: Promise<{ id: string }> | { id: string };
}

export default async function RouteDetailsPage({ params }: RouteDetailsPageProps) {
  const resolvedParams = await params;
  const route = await getRouteById(resolvedParams.id);

  if (!route) {
    notFound();
  }

  return <RouteStopsView route={route} />;
}
