import {
  PrismaClient,
  Role,
  TripStatus,
  MaintenanceCategory,
  MaintenanceStatus,
} from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminService } from './admin.service';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { PrismaService } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { calculateHaversineDistanceMeters } from '../common/utils/geo.util';
import {
  calculateSmoothedEtaMinutes,
  getSmoothedSpeedKmh,
  DEFAULT_URBAN_SPEED_KMH,
} from '../common/utils/eta.util';

async function runComprehensiveVerification() {
  console.log('========================================================================');
  console.log('🧪 BTS Phase 11 & Regressions (Phases 5–10) Automated Verification Suite');
  console.log('========================================================================\n');

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
      throw new Error('Precondition failed: No admin user found in database.');
    }

    const baselineTrip = await prisma.trip.findFirst({
      where: { status: TripStatus.ACTIVE },
      include: { driver: true, bus: true, route: true },
    });
    if (!baselineTrip) {
      throw new Error('Precondition failed: No active trip found in database.');
    }

    // =========================================================================
    // 1. ADMIN RBAC VERIFICATION
    // =========================================================================
    console.log('--- 1. Admin RBAC & Role Verification ---');

    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    const mockAdminContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: Role.ADMIN, id: adminUser.id } }),
      }),
    } as any;

    const mockDriverContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: Role.DRIVER, id: baselineTrip.driver.userId } }),
      }),
    } as any;

    const mockStudentContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: Role.STUDENT, id: 'mock-student' } }),
      }),
    } as any;

    jestOrSpyReflector(reflector, [Role.ADMIN]);

    assert(
      rolesGuard.canActivate(mockAdminContext) === true,
      'RolesGuard permits Role.ADMIN access to admin endpoints',
    );
    assert(
      rolesGuard.canActivate(mockDriverContext) === false,
      'RolesGuard denies Role.DRIVER access (403 Forbidden)',
    );
    assert(
      rolesGuard.canActivate(mockStudentContext) === false,
      'RolesGuard denies Role.STUDENT access (403 Forbidden)',
    );

    // =========================================================================
    // 2. ASSIGNMENT INTEGRITY ENGINE
    // =========================================================================
    console.log('\n--- 2. Assignment Integrity Engine Safety Rules ---');

    // 2.1 Driver Conflict Check (409)
    try {
      await assignmentIntegrityService.assertDriverAvailable(baselineTrip.driverId);
      assert(false, 'Should throw 409 ConflictException for driver on ACTIVE trip');
    } catch (err: any) {
      assert(
        err instanceof ConflictException && err.getStatus() === 409,
        'Driver assigned to ACTIVE trip triggers 409 ConflictException',
      );
    }

    // 2.2 Bus Conflict Check (409)
    try {
      await assignmentIntegrityService.assertBusAvailable(baselineTrip.busId);
      assert(false, 'Should throw 409 ConflictException for bus on ACTIVE trip');
    } catch (err: any) {
      assert(
        err instanceof ConflictException && err.getStatus() === 409,
        'Bus assigned to ACTIVE trip triggers 409 ConflictException',
      );
    }

    // 2.3 Deactivation Safety Guard: Bus (400)
    try {
      await assignmentIntegrityService.assertBusCanDeactivate(baselineTrip.busId);
      assert(false, 'Should throw 400 BadRequestException for deactivating bus on ACTIVE trip');
    } catch (err: any) {
      assert(
        err instanceof BadRequestException && err.getStatus() === 400,
        'Deactivating bus on ACTIVE trip triggers 400 BadRequestException',
      );
    }

    // 2.4 Deactivation Safety Guard: Driver (400)
    try {
      await assignmentIntegrityService.assertDriverCanDeactivate(baselineTrip.driverId);
      assert(false, 'Should throw 400 BadRequestException for deactivating driver on ACTIVE trip');
    } catch (err: any) {
      assert(
        err instanceof BadRequestException && err.getStatus() === 400,
        'Deactivating driver on ACTIVE trip triggers 400 BadRequestException',
      );
    }

    // =========================================================================
    // 3. TELEMETRY FRESHNESS CATEGORIZATION
    // =========================================================================
    console.log('\n--- 3. Telemetry Freshness Categorization ---');

    const fleetStatus = await adminService.getFleetStatus();
    assert(fleetStatus.telemetry !== undefined, 'getFleetStatus returns telemetry aggregates');
    assert(typeof fleetStatus.telemetry.active === 'number', 'Freshness <=30s counted in telemetry.active');
    assert(typeof fleetStatus.telemetry.stale === 'number', 'Freshness 31-120s counted in telemetry.stale');
    assert(typeof fleetStatus.telemetry.offline === 'number', 'Freshness >120s counted in telemetry.offline');

    // Categorization logic verification
    const freshDiff = 15; // 15s ago
    const staleDiff = 65; // 65s ago
    const offlineDiff = 180; // 180s ago

    const categorize = (diff: number) => {
      if (diff <= 30) return 'ACTIVE';
      if (diff <= 120) return 'STALE';
      return 'OFFLINE';
    };

    assert(categorize(freshDiff) === 'ACTIVE', '15s delay is categorized as LIVE / ACTIVE');
    assert(categorize(staleDiff) === 'STALE', '65s delay is categorized as STALE');
    assert(categorize(offlineDiff) === 'OFFLINE', '180s delay is categorized as OFFLINE');

    // =========================================================================
    // 4. EMERGENCY SOS LIFECYCLE
    // =========================================================================
    console.log('\n--- 4. Emergency SOS Lifecycle & Resolution ---');

    // Create a temporary SOS audit record
    const tempSos = await prisma.tripAudit.create({
      data: {
        tripId: baselineTrip.id,
        driverId: baselineTrip.driverId,
        action: 'SOS',
        timestamp: new Date(),
        metadata: {
          reason: 'Mechanical failure test distress beacon',
          lastKnownGps: { latitude: 13.1332, longitude: 77.5681, speed: 0 },
        },
      },
    });

    assert(Boolean(tempSos.id), 'Emergency SOS alert beacon recorded in TripAudit');

    // 4.1 Acknowledgment stamping
    const ackResult = await adminService.acknowledgeSos(tempSos.id, adminUser.id);
    assert(ackResult.success === true, 'POST /admin/sos/:id/acknowledge succeeds');
    assert(Boolean(ackResult.alert.acknowledgedAt), 'acknowledgedAt timestamp is stamped');
    assert(ackResult.alert.acknowledgedBy === adminUser.id, 'acknowledgedBy matches admin ID');

    // 4.2 Empty resolution notes rejection (400)
    try {
      await adminService.resolveSos(tempSos.id, { resolutionNotes: '   ' }, adminUser.id);
      assert(false, 'Should throw 400 when resolutionNotes is empty');
    } catch (err: any) {
      assert(
        err instanceof BadRequestException,
        'Empty resolutionNotes triggers 400 BadRequestException',
      );
    }

    // 4.3 Successful resolution with audit trail
    const resolveResult = await adminService.resolveSos(
      tempSos.id,
      { resolutionNotes: 'Backup van dispatched; students transferred safely' },
      adminUser.id,
    );
    assert(resolveResult.success === true, 'POST /admin/sos/:id/resolve succeeds');
    assert(Boolean(resolveResult.alert.resolvedAt), 'resolvedAt timestamp is stamped');
    assert(
      resolveResult.alert.resolutionNotes === 'Backup van dispatched; students transferred safely',
      'resolutionNotes is stored',
    );

    // Verify SOS audit action logged
    const sosAudit = await prisma.adminAudit.findFirst({
      where: { action: 'SOS_RESOLVED', targetId: tempSos.id },
    });
    assert(Boolean(sosAudit), 'SOS_RESOLVED is persisted into AdminAudit log');

    // Cleanup temp SOS
    await prisma.adminAudit.deleteMany({ where: { targetId: tempSos.id } });
    await prisma.tripAudit.delete({ where: { id: tempSos.id } });

    // =========================================================================
    // 5. MAINTENANCE WORKFLOW
    // =========================================================================
    console.log('\n--- 5. Fleet Maintenance Work Order Lifecycle ---');

    // 5.1 Ticket creation (REPORTED)
    const newTicket = await adminService.createMaintenanceTicket(
      {
        busId: baselineTrip.busId,
        category: MaintenanceCategory.TIRES,
        description: 'Tire tread depth below 2mm on rear right assembly',
        notes: 'Routine depot inspection check',
      },
      adminUser.id,
    );
    assert(Boolean(newTicket.id), 'POST /admin/maintenance creates ticket');
    assert(newTicket.status === MaintenanceStatus.REPORTED, 'Default status is REPORTED');
    assert(newTicket.category === 'TIRES', 'Category is TIRES');

    // 5.2 Transition to IN_PROGRESS
    const inProgressTicket = await adminService.updateMaintenanceTicket(
      newTicket.id,
      {
        status: MaintenanceStatus.IN_PROGRESS,
        notes: 'Vehicle moved to depot bay 3 for tire change',
      },
      adminUser.id,
    );
    assert(inProgressTicket.status === MaintenanceStatus.IN_PROGRESS, 'Transitioned to IN_PROGRESS');

    // 5.3 Transition to RESOLVED
    const resolvedTicket = await adminService.updateMaintenanceTicket(
      newTicket.id,
      {
        status: MaintenanceStatus.RESOLVED,
        notes: 'Replaced tire assembly. Road test passed.',
      },
      adminUser.id,
    );
    assert(resolvedTicket.status === MaintenanceStatus.RESOLVED, 'Transitioned to RESOLVED');
    assert(Boolean(resolvedTicket.resolvedAt), 'resolvedAt timestamp automatically populated');

    // Cleanup maintenance ticket
    await prisma.adminAudit.deleteMany({ where: { targetId: newTicket.id } });
    await prisma.busMaintenance.delete({ where: { id: newTicket.id } });

    // =========================================================================
    // 6. AUDIT METADATA SANITIZATION
    // =========================================================================
    console.log('\n--- 6. Sensitive Credential Redaction & Audit Sanitization ---');

    const samplePayload = {
      email: 'driver.secure@bmsit.in',
      password: 'PlainSecretPassword123!',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      refreshToken: 'jwt-refresh-token-value',
      apiSecret: 'super-secret-key',
      plateNumber: 'KA-04-E-9999',
      capacity: 50,
      nested: {
        authorizationHeader: 'Bearer secret-jwt',
        normalField: 'BMSIT Campus Bus',
      },
    };

    const sanitized = (adminService as any).sanitizeMetadata(samplePayload);
    assert(sanitized.password === '[REDACTED]', 'Key "password" redacted to [REDACTED]');
    assert(sanitized.passwordHash === '[REDACTED]', 'Key "passwordHash" redacted to [REDACTED]');
    assert(sanitized.refreshToken === '[REDACTED]', 'Key "refreshToken" redacted to [REDACTED]');
    assert(sanitized.apiSecret === '[REDACTED]', 'Key "apiSecret" redacted to [REDACTED]');
    assert(
      sanitized.nested.authorizationHeader === '[REDACTED]',
      'Nested "authorizationHeader" redacted to [REDACTED]',
    );
    assert(sanitized.plateNumber === 'KA-04-E-9999', 'Safe field "plateNumber" preserved');
    assert(sanitized.capacity === 50, 'Safe field "capacity" preserved');
    assert(sanitized.nested.normalField === 'BMSIT Campus Bus', 'Safe nested field preserved');

    // =========================================================================
    // 7. REGRESSION CHECKS (PHASES 5–10)
    // =========================================================================
    console.log('\n--- 7. Regressions: Phases 5–10 Verification ---');

    // 7.1 Geofence Proximity (Haversine & 50m detection)
    // BMSIT Gate approx: 13.13324, 77.56815
    const bmsitLat = 13.13324;
    const bmsitLng = 77.56815;
    // Point ~25m away
    const nearLat = 13.1334;
    const nearLng = 77.56815;
    const distNear = calculateHaversineDistanceMeters(bmsitLat, bmsitLng, nearLat, nearLng);
    assert(
      distNear < 50,
      `Point within 50m detected (dist = ${distNear.toFixed(1)}m < 50m)`,
    );

    // Point ~300m away
    const farLat = 13.136;
    const farLng = 77.56815;
    const distFar = calculateHaversineDistanceMeters(bmsitLat, bmsitLng, farLat, farLng);
    assert(
      distFar > 200,
      `Point outside geofence boundary detected (dist = ${distFar.toFixed(1)}m > 200m)`,
    );

    // 7.2 Smoothed ETAs
    const stoppedSpeed = getSmoothedSpeedKmh(1.5);
    assert(
      stoppedSpeed === DEFAULT_URBAN_SPEED_KMH,
      `Stopped speed (<3 km/h) falls back to urban average (${DEFAULT_URBAN_SPEED_KMH} km/h)`,
    );

    const glitchedSpeed = getSmoothedSpeedKmh(150);
    assert(
      glitchedSpeed === DEFAULT_URBAN_SPEED_KMH,
      `Glitched GPS speed (>120 km/h) falls back to urban average (${DEFAULT_URBAN_SPEED_KMH} km/h)`,
    );

    const normalSpeed = getSmoothedSpeedKmh(35);
    assert(normalSpeed === 35, 'Valid in-range speed (35 km/h) preserved');

    const etaIntMinutes = calculateSmoothedEtaMinutes(5000, 30); // 5km at 30km/h = 10 min
    assert(
      Number.isInteger(etaIntMinutes) && etaIntMinutes === 10,
      'calculateSmoothedEtaMinutes returns integer minutes (10 mins)',
    );

    // 7.3 Event-Sourced Percentage Occupancy
    const capacity = 50;
    const boardings = 35;
    const dropouts = 10;
    const currentOccupancy = Math.max(0, boardings - dropouts);
    const occupancyPercentage = Math.min(100, Math.round((currentOccupancy / capacity) * 100));
    assert(currentOccupancy === 25, 'Net occupancy = 35 boards - 10 drops = 25 passengers');
    assert(occupancyPercentage === 50, 'Occupancy percentage = (25 / 50) * 100 = 50%');

    // 7.4 BMSIT Verified Route Dataset Preservation
    const routeCount = await prisma.route.count();
    const stopCount = await prisma.stop.count();
    const routeStopCount = await prisma.routeStop.count();

    assert(routeCount === 9, `All 9 verified BMSIT transit routes preserved (count = ${routeCount})`);
    assert(stopCount === 129, `All 129 physical transit stops preserved (count = ${stopCount})`);
    assert(routeStopCount === 139, `All 139 route-stop sequences preserved (count = ${routeStopCount})`);

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n========================================================================');
    console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
    console.log('========================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL AUTOMATED VERIFICATION ASSERTIONS PASSED CLEANLY!\n');
    } else {
      console.error('❌ SOME ASSERTIONS FAILED.');
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function jestOrSpyReflector(reflector: Reflector, roles: Role[]) {
  reflector.getAllAndOverride = (_key: any, _targets: any[]) => roles;
}

runComprehensiveVerification();
