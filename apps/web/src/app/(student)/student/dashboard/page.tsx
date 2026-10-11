import { getMyPickup, getStudentProfile } from '@/services/student.service';
import { getActiveTripForRoute } from '@/services/telemetry.service';
import { StudentDashboardView } from '@/components/dashboard/StudentDashboardView';

export const dynamic = 'force-dynamic';

export default async function StudentDashboardPage() {
  const [profile, pickup] = await Promise.all([
    getStudentProfile(),
    getMyPickup(),
  ]);

  let activeTrip = null;
  if (pickup?.routeId) {
    activeTrip = await getActiveTripForRoute(pickup.routeId);
  }

  return (
    <StudentDashboardView
      initialProfile={profile}
      initialPickup={pickup}
      initialActiveTrip={activeTrip}
    />
  );
}
