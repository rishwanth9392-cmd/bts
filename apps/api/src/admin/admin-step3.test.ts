import { PrismaClient, Role, BusStatus, TripStatus, MaintenanceCategory, MaintenanceStatus } from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { PrismaService } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

async function runStep3Verification() {
  console.log('🧪 Starting Step 3 Backend REST APIs Smoke & Verification Tests...\n');

  const prisma = new PrismaClient() as unknown as PrismaService;
  const assignmentIntegrityService = new AssignmentIntegrityService(prisma);
  const adminService = new AdminService(prisma, assignmentIntegrityService);

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
    const adminUser = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });
    if (!adminUser) {
      throw new Error('Precondition failed: No admin user found.');
    }

    // =========================================================================
    // TEST SUITE 1: Bus Management APIs
    // =========================================================================
    console.log('--- Test Suite 1: Bus Management (POST, GET, PATCH) ---');

    const testPlate = `KA-04-TEST-${Date.now().toString().slice(-4)}`;
    const createdBus = await adminService.createBus(
      {
        plateNumber: testPlate,
        capacity: 45,
        model: 'Tata Marcopolo BS6',
        status: BusStatus.ACTIVE,
      },
      adminUser.id,
    );
    assert(Boolean(createdBus.id), 'POST /admin/buses creates new bus record');
    assert(createdBus.capacity === 45, 'Bus capacity correctly set to 45');
    assert(createdBus.model === 'Tata Marcopolo BS6', 'Bus model correctly stored');

    // Duplicate plate should throw 409 ConflictException
    try {
      await adminService.createBus(
        { plateNumber: testPlate, capacity: 50 },
        adminUser.id,
      );
      assert(false, 'Duplicate plate should throw ConflictException');
    } catch (err: any) {
      assert(err instanceof ConflictException, 'Duplicate plate number triggers 409 ConflictException');
    }

    // Invalid capacity <= 0 should throw 400 BadRequestException
    try {
      await adminService.createBus(
        { plateNumber: `KA-04-INVALID-${Date.now()}`, capacity: 0 },
        adminUser.id,
      );
      assert(false, 'Capacity 0 should throw BadRequestException');
    } catch (err: any) {
      assert(err instanceof BadRequestException, 'Capacity <= 0 triggers 400 BadRequestException');
    }

    // GET /admin/buses with search
    const busList = await adminService.getBuses({ search: testPlate });
    assert(busList.data.length >= 1, 'GET /admin/buses retrieves created bus by search filter');
    assert('maintenanceCount' in busList.data[0], 'GET /admin/buses includes maintenanceCount');

    // PATCH /admin/buses/:id
    const updatedBus = await adminService.updateBus(
      createdBus.id,
      { capacity: 52, model: 'Tata Marcopolo Ultra 2026' },
      adminUser.id,
    );
    assert(updatedBus.capacity === 52, 'PATCH /admin/buses/:id updates bus capacity');
    assert(updatedBus.model === 'Tata Marcopolo Ultra 2026', 'PATCH /admin/buses/:id updates bus model');

    // Verify BUS_CREATED & BUS_UPDATED audit logs
    const busAudits = await prisma.adminAudit.findMany({
      where: { targetId: createdBus.id },
    });
    const hasBusCreated = busAudits.some((a) => a.action === 'BUS_CREATED');
    const hasBusUpdated = busAudits.some((a) => a.action === 'BUS_UPDATED');
    assert(hasBusCreated, 'BUS_CREATED action logged in AdminAudit');
    assert(hasBusUpdated, 'BUS_UPDATED action logged in AdminAudit');

    // =========================================================================
    // TEST SUITE 2: Driver Management APIs
    // =========================================================================
    console.log('\n--- Test Suite 2: Driver Management (POST, GET, PATCH) ---');

    const testDriverEmail = `test_driver_${Date.now()}@bmsit.edu`;
    const testLicense = `KA-TEST-DL-${Date.now().toString().slice(-4)}`;

    const createdDriver = await adminService.createDriver(
      {
        email: testDriverEmail,
        name: 'Ramesh Kumar',
        licenseNumber: testLicense,
        phone: '+91 98765 43210',
      },
      adminUser.id,
    );
    assert(Boolean(createdDriver.id), 'POST /admin/drivers creates driver linked to user auth');
    assert(createdDriver.name === 'Ramesh Kumar', 'Driver name correctly stored');

    // GET /admin/drivers (Ensure password and secrets are NOT exposed)
    const driverList = await adminService.getDrivers({ search: testLicense });
    assert(driverList.data.length >= 1, 'GET /admin/drivers retrieves driver by license search');
    const returnedDriver = driverList.data[0] as any;
    assert(
      !('passwordHash' in returnedDriver) &&
      !('refreshToken' in returnedDriver) &&
      !('password' in returnedDriver),
      'GET /admin/drivers strictly suppresses password hashes and secret tokens',
    );

    // PATCH /admin/drivers/:id
    const updatedDriver = await adminService.updateDriver(
      createdDriver.id,
      { phone: '+91 99999 88888', name: 'Ramesh K. (Senior)' },
      adminUser.id,
    );
    assert(updatedDriver.phone === '+91 99999 88888', 'PATCH /admin/drivers/:id updates driver phone');

    // Verify DRIVER_CREATED & DRIVER_UPDATED audit logs
    const driverAudits = await prisma.adminAudit.findMany({
      where: { targetId: createdDriver.id },
    });
    const hasDriverCreated = driverAudits.some((a) => a.action === 'DRIVER_CREATED');
    const hasDriverUpdated = driverAudits.some((a) => a.action === 'DRIVER_UPDATED');
    assert(hasDriverCreated, 'DRIVER_CREATED action logged in AdminAudit');
    assert(hasDriverUpdated, 'DRIVER_UPDATED action logged in AdminAudit');

    // =========================================================================
    // TEST SUITE 3: Fleet Telemetry & Freshness Aggregation
    // =========================================================================
    console.log('\n--- Test Suite 3: GET /admin/fleet/status Freshness Computation ---');

    // Create 3 active trips with distinct telemetry timestamps:
    // 1. Fresh (recorded 10 seconds ago <= 30s) -> ACTIVE
    // 2. Stale (recorded 60 seconds ago > 30s <= 120s) -> STALE
    // 3. Offline (recorded 300 seconds ago > 120s) -> OFFLINE

    const route = await prisma.route.findFirst();
    if (!route) throw new Error('No route found in DB');

    const busFresh = await prisma.bus.create({
      data: { plateNumber: `KA-FRESH-${Date.now().toString().slice(-4)}`, capacity: 40 },
    });
    const busStale = await prisma.bus.create({
      data: { plateNumber: `KA-STALE-${Date.now().toString().slice(-4)}`, capacity: 40 },
    });
    const busOffline = await prisma.bus.create({
      data: { plateNumber: `KA-OFFLINE-${Date.now().toString().slice(-4)}`, capacity: 40 },
    });

    // Create mock user drivers for the trips
    const u1 = await prisma.user.create({
      data: { email: `d1_${Date.now()}@bmsit.edu`, role: Role.DRIVER, driver: { create: { licenseNumber: `LIC-D1-${Date.now().toString().slice(-4)}` } } },
      include: { driver: true },
    });
    const u2 = await prisma.user.create({
      data: { email: `d2_${Date.now()}@bmsit.edu`, role: Role.DRIVER, driver: { create: { licenseNumber: `LIC-D2-${Date.now().toString().slice(-4)}` } } },
      include: { driver: true },
    });
    const u3 = await prisma.user.create({
      data: { email: `d3_${Date.now()}@bmsit.edu`, role: Role.DRIVER, driver: { create: { licenseNumber: `LIC-D3-${Date.now().toString().slice(-4)}` } } },
      include: { driver: true },
    });

    const tripFresh = await prisma.trip.create({
      data: { busId: busFresh.id, routeId: route.id, driverId: u1.driver!.id, status: TripStatus.ACTIVE },
    });
    const tripStale = await prisma.trip.create({
      data: { busId: busStale.id, routeId: route.id, driverId: u2.driver!.id, status: TripStatus.ACTIVE },
    });
    const tripOffline = await prisma.trip.create({
      data: { busId: busOffline.id, routeId: route.id, driverId: u3.driver!.id, status: TripStatus.ACTIVE },
    });

    const now = Date.now();
    await prisma.locationHistory.create({
      data: { tripId: tripFresh.id, busId: busFresh.id, latitude: 13.0, longitude: 77.0, recordedAt: new Date(now - 10 * 1000) },
    });
    await prisma.locationHistory.create({
      data: { tripId: tripStale.id, busId: busStale.id, latitude: 13.0, longitude: 77.0, recordedAt: new Date(now - 60 * 1000) },
    });
    await prisma.locationHistory.create({
      data: { tripId: tripOffline.id, busId: busOffline.id, latitude: 13.0, longitude: 77.0, recordedAt: new Date(now - 300 * 1000) },
    });

    const fleetStatus = await adminService.getFleetStatus();
    assert(fleetStatus.telemetry.active >= 1, `Freshness bucket ACTIVE: counted >= 1 (actual: ${fleetStatus.telemetry.active})`);
    assert(fleetStatus.telemetry.stale >= 1, `Freshness bucket STALE: counted >= 1 (actual: ${fleetStatus.telemetry.stale})`);
    assert(fleetStatus.telemetry.offline >= 1, `Freshness bucket OFFLINE: counted >= 1 (actual: ${fleetStatus.telemetry.offline})`);
    assert(typeof fleetStatus.safety.unacknowledgedSosCount === 'number', 'Fleet status includes unacknowledgedSosCount');

    // =========================================================================
    // TEST SUITE 4: Trip Cancellation & Audit
    // =========================================================================
    console.log('\n--- Test Suite 4: Trip Operations & Cancellation ---');

    const cancelledTrip = await adminService.cancelTrip(
      tripFresh.id,
      adminUser.id,
      'Mechanical breakdown on expressway approach',
    );
    assert(cancelledTrip.status === TripStatus.CANCELLED, 'Trip status updated to CANCELLED');
    assert(Boolean(cancelledTrip.endTime), 'Cancelled trip has endTime set');

    const cancelAudit = await prisma.adminAudit.findFirst({
      where: { targetId: tripFresh.id, action: 'TRIP_CANCELLED' },
    });
    assert(Boolean(cancelAudit), 'TRIP_CANCELLED action logged in AdminAudit');
    const cancelMeta = cancelAudit?.metadata as any;
    assert(
      cancelMeta?.reason === 'Mechanical breakdown on expressway approach',
      'Audit log captures cancellation reason accurately',
    );

    // =========================================================================
    // TEST SUITE 5: SOS Safety Monitoring (Acknowledge & Resolve)
    // =========================================================================
    console.log('\n--- Test Suite 5: SOS Safety Monitoring & Resolution ---');

    // Create an unacknowledged SOS alert
    const sosAudit = await prisma.tripAudit.create({
      data: {
        tripId: tripStale.id,
        driverId: u2.driver!.id,
        action: 'SOS',
        timestamp: new Date(),
        metadata: {
          lastKnownGps: { latitude: 13.123, longitude: 77.567 },
          alertMessage: 'Medical emergency on bus',
        },
      },
    });

    // Acknowledge SOS
    const ackResult = await adminService.acknowledgeSos(sosAudit.id, adminUser.id);
    assert(Boolean(ackResult.alert.acknowledgedAt), 'SOS acknowledgedAt persisted');
    assert(ackResult.alert.acknowledgedBy === adminUser.id, 'SOS acknowledgedBy matches admin ID');

    const ackAudit = await prisma.adminAudit.findFirst({
      where: { targetId: sosAudit.id, action: 'SOS_ACKNOWLEDGED' },
    });
    assert(Boolean(ackAudit), 'SOS_ACKNOWLEDGED action logged in AdminAudit');

    // Resolve SOS
    const resolveResult = await adminService.resolveSos(
      sosAudit.id,
      { resolutionNotes: 'Ambulance arrived at Hebbal stop. Student stabilized and hospital escort dispatched.' },
      adminUser.id,
    );
    assert(Boolean(resolveResult.alert.resolvedAt), 'SOS resolvedAt persisted');
    assert(
      Boolean(resolveResult.alert.resolutionNotes?.includes('Ambulance arrived')),
      'SOS resolutionNotes persisted',
    );

    const resolveAudit = await prisma.adminAudit.findFirst({
      where: { targetId: sosAudit.id, action: 'SOS_RESOLVED' },
    });
    assert(Boolean(resolveAudit), 'SOS_RESOLVED action logged in AdminAudit');

    // GET /admin/sos
    const sosList = await adminService.getSosAlerts();
    assert(sosList.data.length >= 1, 'GET /admin/sos retrieves SOS alerts with metadata');
    assert(sosList.data.some((s) => s.id === sosAudit.id && s.isResolved), 'Resolved SOS alert verified in GET list');

    // =========================================================================
    // TEST SUITE 6: Maintenance Foundation APIs
    // =========================================================================
    console.log('\n--- Test Suite 6: Maintenance Management (POST, GET, PATCH) ---');

    const ticket = await adminService.createMaintenanceTicket(
      {
        busId: busStale.id,
        category: MaintenanceCategory.TIRES,
        description: 'Rear right tire pressure dropping below 28 PSI',
        notes: 'Driver reported vibration above 40 km/h',
      },
      adminUser.id,
    );
    assert(Boolean(ticket.id), 'POST /admin/maintenance creates ticket in REPORTED status');
    assert(ticket.status === MaintenanceStatus.REPORTED, 'Ticket default status is REPORTED');

    const updatedTicket = await adminService.updateMaintenanceTicket(
      ticket.id,
      {
        status: MaintenanceStatus.RESOLVED,
        notes: 'Puncture repaired and tire reinflated to 36 PSI',
      },
      adminUser.id,
    );
    assert(updatedTicket.status === MaintenanceStatus.RESOLVED, 'PATCH /admin/maintenance updates status to RESOLVED');
    assert(Boolean(updatedTicket.resolvedAt), 'Setting status to RESOLVED automatically populates resolvedAt');

    const maintAudit = await prisma.adminAudit.findFirst({
      where: { targetId: ticket.id, action: 'MAINTENANCE_CREATED' },
    });
    assert(Boolean(maintAudit), 'MAINTENANCE_CREATED logged in AdminAudit');

    // =========================================================================
    // TEST SUITE 7: RBAC Protection Verification
    // =========================================================================
    console.log('\n--- Test Suite 7: RBAC Protection on Admin Endpoints ---');

    const mockReflector = {
      getAllAndOverride: (key: string) => {
        if (key === ROLES_KEY) return [Role.ADMIN];
        return [];
      },
    } as unknown as Reflector;

    const rolesGuard = new RolesGuard(mockReflector);

    const createCtx = (role: Role) => ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'test-user', role } }),
      }),
    } as any);

    assert(rolesGuard.canActivate(createCtx(Role.ADMIN)) === true, 'Role.ADMIN is granted access');
    assert(rolesGuard.canActivate(createCtx(Role.DRIVER)) === false, 'Role.DRIVER is rejected (403 Forbidden)');
    assert(rolesGuard.canActivate(createCtx(Role.STUDENT)) === false, 'Role.STUDENT is rejected (403 Forbidden)');

    // Teardown test artifacts
    await prisma.adminAudit.deleteMany({
      where: {
        targetId: {
          in: [createdBus.id, createdDriver.id, tripFresh.id, sosAudit.id, ticket.id],
        },
      },
    });

    console.log(`\n========================================`);
    console.log(`✨ Step 3 Results: ${passedTests}/${totalTests} tests passed successfully!`);
    console.log(`========================================\n`);
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

runStep3Verification().catch((err) => {
  console.error('Fatal Step 3 verification error:', err);
  process.exit(1);
});
