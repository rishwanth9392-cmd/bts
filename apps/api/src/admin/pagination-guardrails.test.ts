import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AdminService } from './admin.service';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { BusesService } from '../buses/buses.service';
import { RoutesService } from '../routes/routes.service';
import { clampPagination, buildPaginatedResponse } from '../common/utils/pagination.util';

async function runPaginationGuardrailsSuite() {
  console.log('========================================================================');
  console.log('🛡️ Step 4: Endpoint Pagination & Query Guardrails Verification Suite');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;
  const assignmentIntegrityService = new AssignmentIntegrityService(prisma);
  const adminService = new AdminService(prisma, assignmentIntegrityService);
  const busesService = new BusesService(prisma);
  const routesService = new RoutesService(prisma);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      process.exitCode = 1;
    }
  }

  try {
    // =========================================================================
    // 1. UNIT TESTS: CLAMPING, LOWER BOUND & NAN SAFETY
    // =========================================================================
    console.log('--- 1. Pure Pagination Clamping & Validation Logic ---');

    // 1.1 Upper limit clamping: limit=5000 -> 100
    const clampedUpper = clampPagination({ limit: 5000 });
    assert(clampedUpper.limit === 100, 'Submitting limit=5000 clamps query limit to 100');

    // 1.2 Lower bound & negative number safety: limit=-10 -> 50
    const clampedNeg = clampPagination({ limit: -10 });
    assert(clampedNeg.limit === 50, 'Submitting limit=-10 falls back safely to default 50');

    // 1.3 Zero safety: limit=0 -> 50
    const clampedZero = clampPagination({ limit: 0 });
    assert(clampedZero.limit === 50, 'Submitting limit=0 falls back safely to default 50');

    // 1.4 Non-numeric string safety: limit='abc' -> 50
    const clampedNan = clampPagination({ limit: 'abc' });
    assert(clampedNan.limit === 50, 'Submitting limit="abc" falls back safely to default 50');

    // 1.5 Page / Offset calculation: page=3 with limit=20 -> skip=40
    const clampedOffset = clampPagination({ page: 3, limit: 20 });
    assert(clampedOffset.limit === 20, 'Submitting limit=20 preserves valid limit 20');
    assert(clampedOffset.page === 3, 'Submitting page=3 preserves page 3');
    assert(clampedOffset.skip === 40, 'Submitting page=3 with limit=20 calculates skip: 40 correctly');

    // 1.6 Explicit skip/offset takes precedence over page
    const clampedExplicitOffset = clampPagination({ offset: 75, page: 2, limit: 25 });
    assert(clampedExplicitOffset.skip === 75, 'Explicit offset=75 is preserved and respected');

    // 1.7 Standardized envelope metadata construction
    const sampleEnvelope = buildPaginatedResponse(['item1', 'item2'], 105, {
      page: 1,
      limit: 50,
      skip: 0,
    });
    assert(sampleEnvelope.meta.total === 105, 'Envelope meta.total matches underlying dataset count');
    assert(sampleEnvelope.meta.page === 1, 'Envelope meta.page matches requested page');
    assert(sampleEnvelope.meta.limit === 50, 'Envelope meta.limit matches clamped limit');
    assert(sampleEnvelope.meta.totalPages === 3, 'Envelope meta.totalPages calculates 3 for 105 total items at 50/page');
    assert(sampleEnvelope.total === 105, 'Backward-compatible top-level total property preserved');
    assert(sampleEnvelope.totalPages === 3, 'Backward-compatible top-level totalPages property preserved');

    // =========================================================================
    // 2. INTEGRATION TESTS: ADMINISTRATIVE QUERY CLAMPING
    // =========================================================================
    console.log('\n--- 2. Administrative Query Pagination Clamping ---');

    // 2.1 GET /admin/buses with excessive limit
    const busResUpper = await adminService.getBuses({ limit: 5000 });
    assert(busResUpper.meta.limit === 100, 'GET /admin/buses clamps limit=5000 to meta.limit: 100');
    assert(busResUpper.limit === 100, 'GET /admin/buses preserves top-level limit: 100');
    assert(Array.isArray(busResUpper.data), 'GET /admin/buses returns data array');

    // 2.2 GET /admin/buses with negative limit
    const busResNeg = await adminService.getBuses({ limit: -10 });
    assert(busResNeg.meta.limit === 50, 'GET /admin/buses falls back limit=-10 to meta.limit: 50');

    // 2.3 GET /admin/drivers with limit=5000
    const driverResUpper = await adminService.getDrivers({ limit: 5000 });
    assert(driverResUpper.meta.limit === 100, 'GET /admin/drivers clamps limit=5000 to meta.limit: 100');
    assert(driverResUpper.meta.total >= 0, 'GET /admin/drivers returns non-negative meta.total');

    // 2.4 GET /admin/drivers with limit="invalid"
    const driverResInvalid = await adminService.getDrivers({ limit: 'invalid' as any });
    assert(driverResInvalid.meta.limit === 50, 'GET /admin/drivers falls back limit="invalid" to meta.limit: 50');

    // 2.5 GET /admin/trips with page=3 and limit=20
    const tripResPage = await adminService.getTrips({ page: 3, limit: 20 });
    assert(tripResPage.meta.page === 3, 'GET /admin/trips returns meta.page: 3');
    assert(tripResPage.meta.limit === 20, 'GET /admin/trips returns meta.limit: 20');
    assert(tripResPage.offset === 40, 'GET /admin/trips computes offset: 40');

    // 2.6 GET /admin/sos with limit=5000
    const sosResUpper = await adminService.getSosAlerts({ limit: 5000 });
    assert(sosResUpper.meta.limit === 100, 'GET /admin/sos clamps limit=5000 to meta.limit: 100');

    // 2.7 GET /admin/maintenance with limit=5000
    const maintResUpper = await adminService.getMaintenanceTickets({ limit: 5000 });
    assert(maintResUpper.meta.limit === 100, 'GET /admin/maintenance clamps limit=5000 to meta.limit: 100');

    // 2.8 GET /admin/audit-logs with limit=5000
    const auditResUpper = await adminService.getAuditLogs({ limit: 5000 });
    assert(auditResUpper.meta.limit === 100, 'GET /admin/audit-logs clamps limit=5000 to meta.limit: 100');
    assert(auditResUpper.meta.total >= 0, 'GET /admin/audit-logs returns accurate meta.total');

    // =========================================================================
    // 3. FLEET & ROUTE QUERY PROJECTION GUARDRAILS
    // =========================================================================
    console.log('\n--- 3. Fleet & Route Query Projection Guardrails ---');

    // 3.1 Fleet Bus Projections: GET /buses/fleet
    const activeFleet = await busesService.getActiveFleet();
    assert(Array.isArray(activeFleet), 'BusesService.getActiveFleet returns array of buses');
    if (activeFleet.length > 0) {
      const firstBus = activeFleet[0];
      assert('plateNumber' in firstBus, 'Fleet bus projection contains plateNumber');
      assert('capacity' in firstBus, 'Fleet bus projection contains capacity');
      assert(!('trips' in firstBus), 'Fleet bus projection excludes unconstrained trips relation');
      assert(!('locationHistory' in firstBus), 'Fleet bus projection excludes heavy locationHistory relation');
      assert(!('maintenances' in firstBus), 'Fleet bus projection excludes maintenances relation');
    }

    // 3.2 Routes Service Projections & Deterministic Stop Ordering: GET /routes
    const routes = await routesService.findAll();
    assert(routes.length >= 9, 'RoutesService.findAll retrieves verified transit routes');
    const routeWithStops = routes.find((r) => r.routeStops && r.routeStops.length > 1);
    assert(Boolean(routeWithStops), 'At least one route with multiple routeStops found');

    if (routeWithStops) {
      let isStrictlySorted = true;
      for (let i = 1; i < routeWithStops.routeStops.length; i++) {
        if (routeWithStops.routeStops[i].sequence < routeWithStops.routeStops[i - 1].sequence) {
          isStrictlySorted = false;
          break;
        }
      }
      assert(isStrictlySorted, 'Route stop sequences are deterministically sorted (orderBy: { sequence: "asc" })');

      const firstRouteStop = routeWithStops.routeStops[0];
      assert('sequence' in firstRouteStop, 'RouteStop contains sequence number');
      assert('scheduledTime' in firstRouteStop, 'RouteStop contains scheduledTime string');
      assert(typeof firstRouteStop.stop === 'object', 'RouteStop contains nested stop object');
      assert('name' in firstRouteStop.stop, 'Stop projection contains stop name');
      assert(!('assignments' in firstRouteStop.stop), 'Stop projection strictly excludes student pickup assignments relation');
      assert(!('boardings' in firstRouteStop.stop), 'Stop projection strictly excludes boardingEvent relation');
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`Summary: ${passedTests}/${totalTests} assertions passed`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPaginationGuardrailsSuite().catch((err) => {
  console.error('Fatal test execution failure:', err);
  process.exit(1);
});
