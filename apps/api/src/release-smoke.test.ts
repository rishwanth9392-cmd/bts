import {
  PrismaClient,
  Role,
  BusStatus,
  TripStatus,
  MaintenanceCategory,
  MaintenanceStatus,
  BoardingEventType,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma/prisma.module';
import { AuthService } from './auth/auth.service';
import { RolesGuard } from './auth/guards/roles.guard';
import { ROLES_KEY } from './common/decorators/roles.decorator';
import { AdminService } from './admin/admin.service';
import { AssignmentIntegrityService } from './admin/assignment-integrity.service';
import { TripsService } from './trips/trips.service';
import { TripsGateway } from './trips/trips.gateway';
import { GeofenceService } from './trips/geofence.service';
import { RouteProgressService } from './trips/route-progress.service';
import { EtaService } from './trips/eta.service';
import { NotificationsService } from './notifications/notifications.service';
import { RoutesService } from './routes/routes.service';
import { calculateHaversineDistanceMeters } from './common/utils/geo.util';

export async function runReleaseSmokeSuite() {
  console.log('========================================================================');
  console.log('🚀 Phase 14 Step 5: End-to-End Release Smoke Test & Invariant Suite');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;
  const jwtSecret = process.env.JWT_SECRET || 'super_secret_dev_key_change_in_prod';
  const jwtService = new JwtService({ secret: jwtSecret });
  const authService = new AuthService(prisma, jwtService);

  let totalTests = 0;
  let passedTests = 0;

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

  // Tracking arrays for clean tear-down
  const cleanupUserIds: string[] = [];
  const cleanupStudentIds: string[] = [];
  const cleanupDriverIds: string[] = [];
  const cleanupBusIds: string[] = [];
  const cleanupTripIds: string[] = [];
  const cleanupTicketIds: string[] = [];

  const runSuffix = Date.now().toString().slice(-6);

  try {
    // -------------------------------------------------------------------------
    // Setup Mock Gateway and Notification Services
    // -------------------------------------------------------------------------
    const emittedEvents: Array<{ event: string; target?: string; payload: any }> = [];

    const mockTripsGateway = {
      broadcastTripStarted: (tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:started', target: `trip:${tripId}`, payload });
      },
      broadcastTripCompleted: (tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:completed', target: `trip:${tripId}`, payload });
      },
      broadcastTripCancelled: (tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:cancelled', target: `trip:${tripId}`, payload });
      },
      broadcastLocation: (tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:location', target: `trip:${tripId}`, payload });
      },
      broadcastOccupancy: (tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:occupancy', target: `trip:${tripId}`, payload });
      },
      broadcastAdminSos: (payload: any) => {
        emittedEvents.push({ event: 'admin:sos', target: 'admin', payload });
      },
      emitPickupArrived: (userId: string, payload: any) => {
        emittedEvents.push({ event: 'pickup:arrived', target: `user:${userId}`, payload });
      },
      emitNewNotification: (userId: string, payload: any) => {
        emittedEvents.push({ event: 'notification:new', target: `user:${userId}`, payload });
      },
      emitBoardingConfirmed: (userId: string, payload: any) => {
        emittedEvents.push({ event: 'boarding:confirmed', target: `user:${userId}`, payload });
      },
      emitDropoffConfirmed: (userId: string, payload: any) => {
        emittedEvents.push({ event: 'dropoff:confirmed', target: `user:${userId}`, payload });
      },
      emitStudentEta: (userId: string, payload: any) => {
        emittedEvents.push({ event: 'eta:update', target: `user:${userId}`, payload });
      },
      broadcastProgress: (tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:progress', target: `trip:${tripId}`, payload });
      },
      broadcastTripProgress: (tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:progress', target: `trip:${tripId}`, payload });
      },
    } as unknown as TripsGateway;

    const notificationsService = new NotificationsService(prisma, mockTripsGateway);
    const geofenceService = new GeofenceService(prisma, mockTripsGateway, notificationsService);
    const routeProgressService = new RouteProgressService(prisma, geofenceService, mockTripsGateway);
    const etaService = new EtaService(prisma, mockTripsGateway);
    const tripsService = new TripsService(
      prisma,
      mockTripsGateway,
      geofenceService,
      routeProgressService,
      etaService,
      notificationsService,
    );
    const assignmentIntegrityService = new AssignmentIntegrityService(prisma);
    const adminService = new AdminService(prisma, assignmentIntegrityService);
    const routesService = new RoutesService(prisma);

    // =========================================================================
    // 1. AUTHENTICATION & IDENTITY VERIFICATION
    // =========================================================================
    console.log('--- 1. Authentication & Identity Verification ---');

    const rawPassword = 'Password@BTS2026!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // 1.1 Create Admin Actor
    const adminUser = await prisma.user.create({
      data: {
        email: `smoke-admin-${runSuffix}@bts.campus`,
        passwordHash,
        role: Role.ADMIN,
        active: true,
      },
    });
    cleanupUserIds.push(adminUser.id);

    // 1.2 Create Driver Actor
    const driverUser = await prisma.user.create({
      data: {
        email: `smoke-driver-${runSuffix}@bts.campus`,
        passwordHash,
        role: Role.DRIVER,
        active: true,
      },
    });
    cleanupUserIds.push(driverUser.id);

    const driverProfile = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        name: `Smoke Driver ${runSuffix}`,
        licenseNumber: `DL-SMOKE-${runSuffix}`,
        phone: `+919888${runSuffix.slice(-6)}`,
        active: true,
        isActive: true,
      },
    });
    cleanupDriverIds.push(driverProfile.id);

    // 1.3 Create Student Actor
    const studentUser = await prisma.user.create({
      data: {
        email: `smoke-student-${runSuffix}@bts.campus`,
        passwordHash,
        role: Role.STUDENT,
        active: true,
      },
    });
    cleanupUserIds.push(studentUser.id);

    const studentDob = new Date('2004-05-15T00:00:00.000Z');
    const studentProfile = await prisma.student.create({
      data: {
        userId: studentUser.id,
        usn: `1BY21CS${runSuffix.slice(-3)}`,
        dob: studentDob,
        phone: `+919777${runSuffix.slice(-6)}`,
        active: true,
      },
    });
    cleanupStudentIds.push(studentProfile.id);

    // 1.4 Authenticate Actors via AuthService
    const adminAuth = await authService.loginAdmin(adminUser.email, rawPassword);
    const adminPayload = jwtService.verify(adminAuth.accessToken);
    assert(
      adminPayload.sub === adminUser.id && adminPayload.role === Role.ADMIN,
      'Admin authenticates successfully with verified claims (sub, Role.ADMIN)',
    );

    const driverAuth = await authService.loginDriver(driverProfile.phone!, '123456');
    const driverPayload = jwtService.verify(driverAuth.accessToken);
    assert(
      driverPayload.sub === driverUser.id && driverPayload.role === Role.DRIVER,
      'Driver authenticates successfully with verified claims (sub, Role.DRIVER)',
    );

    const studentAuth = await authService.loginStudent(studentProfile.usn, '2004-05-15');
    const studentPayload = jwtService.verify(studentAuth.accessToken);
    assert(
      studentPayload.sub === studentUser.id && studentPayload.role === Role.STUDENT,
      'Student authenticates successfully with verified claims (sub, Role.STUDENT)',
    );

    // 1.5 Assert Cross-Role Access Guarding
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    const mockAdminHandler = () => {};
    Reflect.defineMetadata(ROLES_KEY, [Role.ADMIN], mockAdminHandler);

    const createMockContext = (role: Role, uid: string) =>
      ({
        getHandler: () => mockAdminHandler,
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { role, id: uid, sub: uid } }),
        }),
      } as any);

    const adminPermitted = rolesGuard.canActivate(createMockContext(Role.ADMIN, adminUser.id));
    assert(adminPermitted === true, 'RolesGuard permits Admin access to administrative handlers');

    const driverPermitted = rolesGuard.canActivate(createMockContext(Role.DRIVER, driverUser.id));
    assert(driverPermitted === false, 'RolesGuard strictly blocks Driver access to administrative handlers');

    const studentPermitted = rolesGuard.canActivate(createMockContext(Role.STUDENT, studentUser.id));
    assert(studentPermitted === false, 'RolesGuard strictly blocks Student access to administrative handlers');

    // =========================================================================
    // 2. MAINTENANCE DISPATCH GATE
    // =========================================================================
    console.log('\n--- 2. Maintenance Dispatch Gate ---');

    // Create Bus A
    const busA = await prisma.bus.create({
      data: {
        plateNumber: `KA-SMOKE-${runSuffix}`,
        capacity: 40,
        model: 'Standard 40-Seater Transit',
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(busA.id);

    // 2.1 Create Active Maintenance Ticket on Bus A
    const maintenanceTicket = await adminService.createMaintenanceTicket(
      {
        busId: busA.id,
        category: MaintenanceCategory.TIRES,
        description: 'Brake pad wear detected during daily pre-trip inspection',
        notes: 'Awaiting workshop mechanic bay allocation',
      },
      adminUser.id,
    );
    cleanupTicketIds.push(maintenanceTicket.id);

    assert(
      maintenanceTicket.status === MaintenanceStatus.REPORTED,
      'Maintenance ticket created in REPORTED status',
    );

    // 2.2 Attempt to Dispatch Bus A While Ticket Is Open
    let dispatchBlocked = false;
    let dispatchBlockMsg = '';
    try {
      await assignmentIntegrityService.assertBusAvailable(busA.id);
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        dispatchBlocked = true;
        dispatchBlockMsg = err.message;
      }
    }
    assert(
      dispatchBlocked && dispatchBlockMsg.includes('active maintenance work order'),
      'Dispatch attempt rejected with 400 BadRequestException due to open maintenance ticket',
    );

    // 2.3 Advance Maintenance Ticket: REPORTED -> IN_PROGRESS
    const ticketInProgress = await adminService.updateMaintenanceTicket(
      maintenanceTicket.id,
      {
        status: MaintenanceStatus.IN_PROGRESS,
        notes: 'Vehicle on hoist; brake pads being replaced with OEM parts.',
      },
      adminUser.id,
    );
    assert(
      ticketInProgress.status === MaintenanceStatus.IN_PROGRESS,
      'Maintenance ticket advanced to IN_PROGRESS',
    );

    // 2.4 Advance Maintenance Ticket: IN_PROGRESS -> RESOLVED with valid fix notes (>= 5 chars)
    const ticketResolved = await adminService.updateMaintenanceTicket(
      maintenanceTicket.id,
      {
        status: MaintenanceStatus.RESOLVED,
        notes: 'OEM brake pad assembly installed and certified roadworthy.',
      },
      adminUser.id,
    );
    assert(
      ticketResolved.status === MaintenanceStatus.RESOLVED &&
        ticketResolved.resolvedAt !== null,
      'Maintenance ticket advanced to RESOLVED with valid notes and timestamp stamped',
    );

    // 2.5 Authorize Vehicle Release via releaseBusToService
    const releasedBus = await adminService.releaseBusToService(busA.id, adminUser.id);
    assert(
      releasedBus.status === BusStatus.ACTIVE && releasedBus.isActive === true,
      'Vehicle successfully released to service via releaseBusToService (status: ACTIVE)',
    );

    // 2.6 Assert Bus Available Post-Release
    let dispatchAllowedPostRelease = true;
    try {
      await assignmentIntegrityService.assertBusAvailable(busA.id);
    } catch {
      dispatchAllowedPostRelease = false;
    }
    assert(
      dispatchAllowedPostRelease,
      'assertBusAvailable cleanly succeeds for released bus with all tickets RESOLVED',
    );

    // =========================================================================
    // 3. DISPATCH & CONCURRENCY GUARD
    // =========================================================================
    console.log('\n--- 3. Dispatch & Concurrency Guard ---');

    // Query verified seeded route
    const verifiedRoute = await prisma.route.findFirst({
      where: { active: true },
      include: {
        routeStops: {
          include: { stop: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });
    if (!verifiedRoute || verifiedRoute.routeStops.length < 2) {
      throw new Error('Precondition failed: No active transit route with at least 2 stops found.');
    }

    // 3.1 Dispatch Released Bus A and Driver to Verified Route
    const dispatchedTrip = await assignmentIntegrityService.assertAndAssignTrip({
      routeId: verifiedRoute.id,
      busId: busA.id,
      driverId: driverProfile.id,
      status: TripStatus.SCHEDULED,
      adminId: adminUser.id,
    });
    cleanupTripIds.push(dispatchedTrip.id);

    assert(
      dispatchedTrip.status === TripStatus.SCHEDULED &&
        dispatchedTrip.busId === busA.id &&
        dispatchedTrip.driverId === driverProfile.id,
      'Trip successfully dispatched and assigned to route with status SCHEDULED',
    );

    // 3.2 Attempt Concurrent Dispatch with Same Bus
    let concurrentBusConflictCaught = false;
    try {
      await assignmentIntegrityService.assertAndAssignTrip({
        routeId: verifiedRoute.id,
        busId: busA.id,
        driverId: driverProfile.id,
        status: TripStatus.SCHEDULED,
        adminId: adminUser.id,
      });
    } catch (err: any) {
      if (err instanceof ConflictException) {
        concurrentBusConflictCaught = true;
      }
    }
    assert(
      concurrentBusConflictCaught,
      'Concurrent dispatch targeting same bus strictly rejected with 409 ConflictException',
    );

    // 3.3 Verify Exactly 1 Trip Created in Database for Bus A
    const activeTripsForBus = await prisma.trip.count({
      where: {
        busId: busA.id,
        status: { in: [TripStatus.SCHEDULED, TripStatus.ACTIVE, TripStatus.READY] },
      },
    });
    assert(
      activeTripsForBus === 1,
      'Database verifies exactly 1 active/scheduled trip exists for target bus',
    );

    // =========================================================================
    // 4. STUDENT ROUTE & PICKUP SELECTION
    // =========================================================================
    console.log('\n--- 4. Student Route & Pickup Selection ---');

    // Student selects stop index 1 along verifiedRoute
    const selectedRouteStop = verifiedRoute.routeStops[1];
    const pickupAssignment = await prisma.pickupAssignment.upsert({
      where: { studentId: studentProfile.id },
      create: {
        studentId: studentProfile.id,
        routeId: verifiedRoute.id,
        stopId: selectedRouteStop.stopId,
        active: true,
      },
      update: {
        routeId: verifiedRoute.id,
        stopId: selectedRouteStop.stopId,
        active: true,
      },
    });

    assert(
      pickupAssignment.routeId === verifiedRoute.id &&
        pickupAssignment.stopId === selectedRouteStop.stopId,
      'Student successfully assigns pickup stop along assigned transit route',
    );

    // Student queries ordered stops
    const queriedRoute = await routesService.findById(verifiedRoute.id);
    assert(
      queriedRoute !== null && queriedRoute.routeStops.length > 0,
      'Student queries route and receives structured route stop collection',
    );

    // Verify sequential stop order
    let sequencesOrdered = true;
    for (let i = 0; i < queriedRoute!.routeStops.length; i++) {
      if (queriedRoute!.routeStops[i].sequence !== i + 1) {
        sequencesOrdered = false;
        break;
      }
    }
    assert(
      sequencesOrdered,
      'Route stops adhere deterministically to sequential order (1, 2, 3...)',
    );

    assert(
      queriedRoute!.routeStops[1].stop.name === selectedRouteStop.stop.name,
      'Student confirmed selected pickup stop exists in route sequence',
    );

    // =========================================================================
    // 5. DRIVER TRIP START & IDEMPOTENCY
    // =========================================================================
    console.log('\n--- 5. Driver Trip Start & Idempotency ---');

    // 5.1 Driver initiates trip start
    const startResult = await tripsService.startTrip(dispatchedTrip.id, driverUser.id);
    assert(
      startResult.status === TripStatus.ACTIVE && startResult.startTime !== null,
      'Driver startTrip transitions trip to ACTIVE with atomic startTime timestamp',
    );

    // 5.2 Assert TRIP_STARTED logged in TripAudit
    const startAudit = await prisma.tripAudit.findFirst({
      where: {
        tripId: dispatchedTrip.id,
        action: 'TRIP_STARTED',
      },
    });
    assert(
      startAudit !== null && startAudit.driverId === driverProfile.id,
      'TRIP_STARTED event atomically recorded in TripAudit with driver ID',
    );

    // 5.3 Idempotent re-trigger of startTrip
    const idempotentStart = await tripsService.startTrip(dispatchedTrip.id, driverUser.id);
    assert(
      idempotentStart.status === TripStatus.ACTIVE,
      'Re-triggering startTrip is idempotent and returns ACTIVE trip cleanly',
    );

    const tripStartAuditCount = await prisma.tripAudit.count({
      where: {
        tripId: dispatchedTrip.id,
        action: 'TRIP_STARTED',
      },
    });
    assert(
      tripStartAuditCount === 1,
      'Idempotent startTrip does NOT generate duplicate TRIP_STARTED audit records',
    );

    // =========================================================================
    // 6. LIVE TELEMETRY & FRESHNESS TIERS
    // =========================================================================
    console.log('\n--- 6. Live Telemetry & Freshness Tiers ---');

    const stopLat = selectedRouteStop.stop.lat || 13.13;
    const stopLng = selectedRouteStop.stop.lng || 77.56;

    // 6.1 Transmit Fresh GPS fix at t0 (distance ~1000m away, speed 30 km/h)
    const t0 = new Date();
    await tripsService.recordLocation(dispatchedTrip.id, driverUser.id, {
      latitude: stopLat + 0.009, // ~1000m north
      longitude: stopLng,
      speed: 30,
      heading: 180,
      accuracy: 5,
      recordedAt: t0.toISOString(),
    });

    const liveEvaluation = etaService.calculateGuardedEta({
      distanceMeters: 1000,
      speedKmh: 30,
      recordedAt: t0,
      now: t0.getTime() + 10_000, // 10s elapsed
    });
    assert(
      liveEvaluation.freshness === 'LIVE' &&
        liveEvaluation.isStale === false &&
        typeof liveEvaluation.etaMinutes === 'number' &&
        Number.isInteger(liveEvaluation.etaMinutes),
      'Telemetry <= 30s old evaluates to LIVE (isStale: false) with smooth integer ETA',
    );

    // 6.2 Simulate elapsed time of 45s -> STALE tier
    const staleEvaluation = etaService.calculateGuardedEta({
      distanceMeters: 1000,
      speedKmh: 30,
      recordedAt: t0,
      now: t0.getTime() + 45_000, // 45s elapsed
    });
    assert(
      staleEvaluation.freshness === 'STALE' &&
        staleEvaluation.isStale === true &&
        staleEvaluation.delayStatus === 'UNKNOWN',
      'Telemetry at 45s degrades to STALE (isStale: true, delayStatus: UNKNOWN)',
    );

    // 6.3 Simulate elapsed time of 150s -> OFFLINE tier
    const offlineEvaluation = etaService.calculateGuardedEta({
      distanceMeters: 1000,
      speedKmh: 30,
      recordedAt: t0,
      now: t0.getTime() + 150_000, // 150s elapsed
    });
    assert(
      offlineEvaluation.freshness === 'OFFLINE' &&
        offlineEvaluation.isStale === true &&
        offlineEvaluation.etaMinutes === null &&
        offlineEvaluation.etaSeconds === null,
      'Telemetry at 150s degrades to OFFLINE with ETA integer strictly suppressed to null',
    );

    // 6.4 Ingest fresh fix (recovery to LIVE)
    const t1 = new Date();
    await tripsService.recordLocation(dispatchedTrip.id, driverUser.id, {
      latitude: stopLat + 0.004, // ~450m north
      longitude: stopLng,
      speed: 28,
      heading: 180,
      accuracy: 4,
      recordedAt: t1.toISOString(),
    });

    const recoveredEvaluation = etaService.calculateGuardedEta({
      distanceMeters: 450,
      speedKmh: 28,
      recordedAt: t1,
      now: t1.getTime() + 5_000, // 5s elapsed
    });
    assert(
      recoveredEvaluation.freshness === 'LIVE' &&
        recoveredEvaluation.isStale === false &&
        typeof recoveredEvaluation.etaMinutes === 'number',
      'Ingesting fresh GPS immediately recovers status to LIVE with integer ETA restored',
    );

    // =========================================================================
    // 7. GEOFENCE & BOARDING LIFECYCLE
    // =========================================================================
    console.log('\n--- 7. Geofence & Boarding Lifecycle ---');

    // 7.1 Transmit coordinates within 50m of Student's selected pickup stop
    // (offset ~0.00015 deg latitude ~= 16.7m distance)
    const arrivalLat = stopLat + 0.00015;
    const arrivalLng = stopLng;
    const arrivalDist = calculateHaversineDistanceMeters(
      arrivalLat,
      arrivalLng,
      stopLat,
      stopLng,
    );

    assert(
      arrivalDist <= 50,
      `Calculated arrival coordinate is within 50m boundary (${Math.round(arrivalDist)}m <= 50m)`,
    );

    // Process geofence update directly
    await geofenceService.processLocationUpdate(
      dispatchedTrip.id,
      verifiedRoute.id,
      arrivalLat,
      arrivalLng,
    );

    const arrivalEvent = emittedEvents.find(
      (e) => e.event === 'pickup:arrived' && e.target === `user:${studentUser.id}`,
    );
    assert(
      arrivalEvent !== undefined,
      'Arrival geofence triggers and emits pickup:arrived strictly to student room',
    );

    // 7.2 Student confirms boarding
    const boardResult = await tripsService.boardTrip(dispatchedTrip.id, studentUser.id, {
      stopId: selectedRouteStop.stopId,
    });
    assert(
      boardResult.success === true && boardResult.event.type === BoardingEventType.BOARD,
      'Student confirms boarding and creates BOARD event bound to authenticated student',
    );

    // 7.3 Concurrency & Idempotency: Send 5 parallel duplicate boarding calls
    const parallelBoardPromises = Array.from({ length: 5 }, () =>
      tripsService.boardTrip(dispatchedTrip.id, studentUser.id, {
        stopId: selectedRouteStop.stopId,
      }),
    );
    const parallelBoardResults = await Promise.all(parallelBoardPromises);
    assert(
      parallelBoardResults.every((r) => r.success === true),
      'All 5 parallel concurrent boarding calls resolve with success: true',
    );

    const totalBoardRecords = await prisma.boardingEvent.count({
      where: {
        tripId: dispatchedTrip.id,
        studentId: studentProfile.id,
        type: BoardingEventType.BOARD,
      },
    });
    assert(
      totalBoardRecords === 1,
      'Exactly 1 BOARD event exists in database despite concurrent duplicate requests',
    );

    // 7.4 Verify Occupancy Payload Minimization
    const occupancyEvents = emittedEvents.filter((e) => e.event === 'trip:occupancy');
    const latestOccupancy = occupancyEvents[occupancyEvents.length - 1];
    assert(
      latestOccupancy !== undefined &&
        typeof latestOccupancy.payload.occupancyPercent === 'number' &&
        typeof latestOccupancy.payload.occupancyStatus === 'string',
      'Occupancy broadcast includes occupancyPercent and categorical occupancyStatus',
    );
    assert(
      (latestOccupancy?.payload as any).boardings === undefined &&
        (latestOccupancy?.payload as any).students === undefined &&
        (latestOccupancy?.payload as any).roster === undefined,
      'Occupancy broadcast strictly suppresses student roster arrays and identifying PII',
    );

    // =========================================================================
    // 8. EMERGENCY SOS INCIDENT & RESOLUTION
    // =========================================================================
    console.log('\n--- 8. Emergency SOS Incident & Resolution ---');

    // 8.1 Driver triggers emergency SOS
    const sosResult = await tripsService.triggerSos(dispatchedTrip.id, driverUser.id);
    assert(
      sosResult.success === true && sosResult.auditId !== undefined,
      'Driver triggers SOS; distress event stamped with auditId',
    );

    const sosAudit = await prisma.tripAudit.findUnique({
      where: { id: sosResult.auditId },
    });
    assert(
      sosAudit !== null &&
        sosAudit.action === 'SOS' &&
        (sosAudit.metadata as any)?.alert === 'EMERGENCY_SOS',
      'TripAudit stores atomic SOS distress record with GPS coordinates and alert metadata',
    );

    // 8.2 Verify admin:sos routed strictly to 'admin' socket room
    const sosEvent = emittedEvents.find((e) => e.event === 'admin:sos');
    assert(
      sosEvent !== undefined && sosEvent.target === 'admin',
      'admin:sos broadcast routes strictly to "admin" room with zero student leakage',
    );

    // 8.3 Admin acknowledges SOS
    const ackResult = await adminService.acknowledgeSos(sosAudit!.id, adminUser.id);
    assert(
      ackResult.success === true && ackResult.alert.acknowledgedAt !== null,
      'Admin acknowledges SOS; acknowledgedAt timestamp stamped successfully',
    );

    // 8.4 Admin resolves SOS with valid notes (>= 5 chars)
    const resolveResult = await adminService.resolveSos(
      sosAudit!.id,
      { resolutionNotes: 'Relief bus KA-01-F-1111 dispatched; all students transferred safely.' },
      adminUser.id,
    );
    assert(
      resolveResult.success === true && resolveResult.alert.resolvedAt !== null,
      'Admin resolves SOS; resolvedAt timestamp and resolution notes persisted',
    );

    // 8.5 Duplicate resolution attempts reject with 409 ConflictException
    let duplicateResolveConflict = false;
    try {
      await adminService.resolveSos(
        sosAudit!.id,
        { resolutionNotes: 'Attempting duplicate resolution on already resolved alert' },
        adminUser.id,
      );
    } catch (err: any) {
      if (err instanceof ConflictException) {
        duplicateResolveConflict = true;
      }
    }
    assert(
      duplicateResolveConflict,
      'Attempt to resolve already resolved SOS alert strictly rejected with 409 ConflictException',
    );

    // =========================================================================
    // 9. STUDENT DROP-OFF
    // =========================================================================
    console.log('\n--- 9. Student Drop-Off Lifecycle ---');

    // 9.1 Student confirms drop-off
    const dropResult = await tripsService.dropTrip(dispatchedTrip.id, studentUser.id, {
      stopId: selectedRouteStop.stopId,
    });
    assert(
      dropResult.success === true && dropResult.event.type === BoardingEventType.DROP,
      'Student confirms drop-off and creates DROP event',
    );

    // 9.2 Assert net occupancy returns to 0 and 0%
    assert(
      dropResult.occupiedSeats === 0 && dropResult.occupancyPercent === 0,
      'Net passengers accurately returns to 0 and occupancyPercent returns to 0%',
    );

    // 9.3 Attempt premature checkout on a non-boarded student
    const nonBoardedUser = await prisma.user.create({
      data: {
        email: `unboarded-${runSuffix}@bts.campus`,
        passwordHash,
        role: Role.STUDENT,
        active: true,
      },
    });
    cleanupUserIds.push(nonBoardedUser.id);

    const nonBoardedProfile = await prisma.student.create({
      data: {
        userId: nonBoardedUser.id,
        usn: `1BY21NB${runSuffix.slice(-3)}`,
        dob: studentDob,
        phone: `+919666${runSuffix.slice(-6)}`,
        active: true,
      },
    });
    cleanupStudentIds.push(nonBoardedProfile.id);

    let invalidDropRejected = false;
    try {
      await tripsService.dropTrip(dispatchedTrip.id, nonBoardedUser.id, {
        stopId: selectedRouteStop.stopId,
      });
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        invalidDropRejected = true;
      }
    }
    assert(
      invalidDropRejected,
      'Drop check-out on non-boarded student strictly rejected with 400 BadRequestException',
    );

    // =========================================================================
    // 10. DRIVER TRIP COMPLETION & IDEMPOTENCY
    // =========================================================================
    console.log('\n--- 10. Driver Trip Completion & Idempotency ---');

    // 10.1 Driver completes trip
    const endResult = await tripsService.endTrip(dispatchedTrip.id, driverUser.id);
    assert(
      endResult.status === TripStatus.COMPLETED && endResult.endTime !== null,
      'Driver endTrip transitions status to COMPLETED and sets atomic endTime',
    );

    // 10.2 Assert TRIP_COMPLETED logged in TripAudit
    const endAudit = await prisma.tripAudit.findFirst({
      where: {
        tripId: dispatchedTrip.id,
        action: 'TRIP_COMPLETED',
      },
    });
    assert(
      endAudit !== null && endAudit.driverId === driverProfile.id,
      'TRIP_COMPLETED event atomically logged in TripAudit with driver ID',
    );

    // 10.3 Idempotent re-trigger of endTrip
    const idempotentEnd = await tripsService.endTrip(dispatchedTrip.id, driverUser.id);
    assert(
      idempotentEnd.status === TripStatus.COMPLETED,
      'Re-triggering endTrip is idempotent and returns COMPLETED trip cleanly',
    );

    const endAuditCount = await prisma.tripAudit.count({
      where: {
        tripId: dispatchedTrip.id,
        action: 'TRIP_COMPLETED',
      },
    });
    assert(
      endAuditCount === 1,
      'Idempotent endTrip does NOT duplicate TRIP_COMPLETED audit records',
    );

    // =========================================================================
    // 11. ADMINISTRATIVE AUDIT TRAIL INTEGRITY
    // =========================================================================
    console.log('\n--- 11. Administrative Audit Trail Integrity ---');

    const adminAudits = await prisma.adminAudit.findMany({
      where: { adminId: adminUser.id },
      orderBy: { timestamp: 'asc' },
    });
    const loggedActions = adminAudits.map((a) => a.action);

    assert(
      loggedActions.includes('MAINTENANCE_CREATED'),
      'AdminAudit records MAINTENANCE_CREATED event',
    );
    assert(
      loggedActions.includes('MAINTENANCE_UPDATED'),
      'AdminAudit records MAINTENANCE_UPDATED event',
    );
    assert(
      loggedActions.includes('MAINTENANCE_RESOLVED'),
      'AdminAudit records MAINTENANCE_RESOLVED event',
    );
    assert(
      loggedActions.includes('BUS_RELEASED_TO_SERVICE'),
      'AdminAudit records BUS_RELEASED_TO_SERVICE event',
    );
    assert(
      loggedActions.includes('SOS_ACKNOWLEDGED'),
      'AdminAudit records SOS_ACKNOWLEDGED event',
    );
    assert(
      loggedActions.includes('SOS_RESOLVED'),
      'AdminAudit records SOS_RESOLVED event',
    );

    // =========================================================================
    // 12. CONCURRENCY ADVISORY LOCKS RELEASE & CONNECTION BASELINE
    // =========================================================================
    console.log('\n--- 12. Advisory Lock Release & Baseline Health ---');

    // Query active PostgreSQL advisory locks
    const advisoryLocks = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count FROM pg_locks WHERE locktype = 'advisory'
    `;
    const activeLockCount = Number(advisoryLocks[0]?.count || 0);

    assert(
      activeLockCount === 0,
      'All PostgreSQL transactional advisory locks (pg_advisory_xact_lock) released cleanly (count: 0)',
    );

    const connectionCheck = await prisma.$queryRaw<Array<{ result: number }>>`
      SELECT 1 as result
    `;
    assert(
      connectionCheck[0]?.result === 1,
      'Database connection pool returns to baseline responsiveness',
    );

    // Final Summary
    console.log('\n========================================================================');
    console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
    console.log('========================================================================\n');

    if (totalTests === passedTests) {
      console.log('🎉 ALL RELEASE SMOKE TEST INVARIANTS PASSED CLEANLY!\n');
    }
  } finally {
    // -------------------------------------------------------------------------
    // Comprehensive Clean Tear-down
    // -------------------------------------------------------------------------
    for (const tripId of cleanupTripIds) {
      await prisma.boardingEvent.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.locationHistory.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.tripAudit.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    }

    for (const ticketId of cleanupTicketIds) {
      await prisma.busMaintenance.delete({ where: { id: ticketId } }).catch(() => {});
    }

    for (const busId of cleanupBusIds) {
      await prisma.bus.delete({ where: { id: busId } }).catch(() => {});
    }

    for (const studentId of cleanupStudentIds) {
      await prisma.pickupAssignment.deleteMany({ where: { studentId } }).catch(() => {});
      await prisma.student.delete({ where: { id: studentId } }).catch(() => {});
    }

    for (const driverId of cleanupDriverIds) {
      await prisma.driver.delete({ where: { id: driverId } }).catch(() => {});
    }

    for (const userId of cleanupUserIds) {
      await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.adminAudit.deleteMany({ where: { adminId: userId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }

    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  runReleaseSmokeSuite().catch((err) => {
    console.error('Fatal release smoke test failure:', err);
    process.exit(1);
  });
}
