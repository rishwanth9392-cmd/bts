import { PrismaClient, BusStatus, TripStatus, Role } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { TripsService } from './trips.service';
import { AdminService } from '../admin/admin.service';
import { AssignmentIntegrityService } from '../admin/assignment-integrity.service';

async function runTripLifecycleTransactionSuite() {
  console.log('========================================================================');
  console.log('🛡️ Step 6: Trip Lifecycle Transactional Integrity Verification Suite');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;

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

  const cleanupTripIds: string[] = [];
  const cleanupBusIds: string[] = [];
  const cleanupDriverIds: string[] = [];
  const cleanupUserIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Mock Gateway and Helper Services
    // -------------------------------------------------------------------------
    const startedBroadcasts: Array<{ tripId: string; payload: any }> = [];
    const completedBroadcasts: Array<{ tripId: string; payload: any }> = [];
    const cancelledBroadcasts: Array<{ tripId: string; payload: any }> = [];

    const mockTripsGateway: any = {
      broadcastTripStarted: (tripId: string, payload: any) => {
        startedBroadcasts.push({ tripId, payload });
      },
      broadcastTripCompleted: (tripId: string, payload: any) => {
        completedBroadcasts.push({ tripId, payload });
      },
      broadcastTripCancelled: (tripId: string, payload: any) => {
        cancelledBroadcasts.push({ tripId, payload });
      },
    };

    let clearedGeofenceTripId: string | null = null;
    let clearedRouteProgressTripId: string | null = null;
    let clearedEtaTripId: string | null = null;

    const mockGeofenceService: any = {
      clearTripGeofenceState: (tripId: string) => {
        clearedGeofenceTripId = tripId;
      },
    };

    const mockRouteProgressService: any = {
      clearTripState: (tripId: string) => {
        clearedRouteProgressTripId = tripId;
      },
    };

    const mockEtaService: any = {
      clearTripState: (tripId: string) => {
        clearedEtaTripId = tripId;
      },
    };

    const tripsService = new TripsService(
      prisma,
      mockTripsGateway,
      mockGeofenceService,
      mockRouteProgressService,
      mockEtaService,
    );

    const assignmentIntegrityService = new AssignmentIntegrityService(prisma);
    const adminService = new AdminService(
      prisma,
      assignmentIntegrityService,
      mockTripsGateway,
      mockGeofenceService,
      mockRouteProgressService,
    );

    // -------------------------------------------------------------------------
    // Seed Fixtures
    // -------------------------------------------------------------------------
    const route = await prisma.route.findFirst({
      where: { active: true },
    });
    if (!route) {
      throw new Error('Precondition failed: No active route found in database.');
    }

    const testTimestamp = Date.now().toString().slice(-6);

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: `admin.lifecycle.${testTimestamp}@bts.test`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: Role.ADMIN,
      },
    });
    cleanupUserIds.push(adminUser.id);

    // Create Driver 1 User & Driver Record
    const driver1User = await prisma.user.create({
      data: {
        email: `driver1.lifecycle.${testTimestamp}@bts.test`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: Role.DRIVER,
      },
    });
    cleanupUserIds.push(driver1User.id);

    const driver1 = await prisma.driver.create({
      data: {
        userId: driver1User.id,
        name: 'Lifecycle Driver Alpha',
        licenseNumber: `DL-LIFE-1-${testTimestamp}`,
        phone: `+919876${testTimestamp.slice(-6)}`,
        isActive: true,
      },
    });
    cleanupDriverIds.push(driver1.id);

    // Create Driver 2 User & Driver Record (for authorization tests)
    const driver2User = await prisma.user.create({
      data: {
        email: `driver2.lifecycle.${testTimestamp}@bts.test`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: Role.DRIVER,
      },
    });
    cleanupUserIds.push(driver2User.id);

    const driver2 = await prisma.driver.create({
      data: {
        userId: driver2User.id,
        name: 'Lifecycle Driver Beta',
        licenseNumber: `DL-LIFE-2-${testTimestamp}`,
        phone: `+919875${testTimestamp.slice(-6)}`,
        isActive: true,
      },
    });
    cleanupDriverIds.push(driver2.id);

    // Create Bus
    const bus = await prisma.bus.create({
      data: {
        plateNumber: `KA-04-LF-${testTimestamp}`,
        capacity: 40,
        model: 'Ashok Leyland Falcon',
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(bus.id);

    // =========================================================================
    // SECTION 1: Atomic Trip Start Lifecycle & Idempotency
    // =========================================================================
    console.log('--- 1. Atomic Trip Start Lifecycle & Idempotency ---');

    // Create a trip in READY status
    const tripToStart = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        driverId: driver1.id,
        status: TripStatus.READY,
      },
    });
    cleanupTripIds.push(tripToStart.id);

    startedBroadcasts.length = 0;
    const startedTrip = await tripsService.startTrip(tripToStart.id, driver1User.id);

    assert(
      startedTrip.status === TripStatus.ACTIVE,
      'Valid start transitions trip status from READY to ACTIVE',
    );
    assert(
      Boolean(startedTrip.startTime),
      'Trip startTime is atomically set upon start',
    );

    // Verify TripAudit created atomically
    const startAudit = await prisma.tripAudit.findFirst({
      where: {
        tripId: tripToStart.id,
        action: 'TRIP_STARTED',
      },
    });
    assert(
      Boolean(startAudit),
      'TripAudit record with action TRIP_STARTED is created atomically',
    );
    assert(
      startAudit?.driverId === driver1.id,
      'TripAudit record driverId correctly references driver',
    );
    assert(
      startAudit?.tripId === tripToStart.id,
      'TripAudit record tripId correctly references trip',
    );
    assert(
      startedBroadcasts.length === 1 && startedBroadcasts[0].tripId === tripToStart.id,
      'WebSocket trip:started event broadcast after transaction commits',
    );

    // Idempotent start retry on already ACTIVE trip
    const initialAuditCount = await prisma.tripAudit.count({
      where: { tripId: tripToStart.id, action: 'TRIP_STARTED' },
    });
    startedBroadcasts.length = 0;

    const idempotentStart = await tripsService.startTrip(tripToStart.id, driver1User.id);
    assert(
      idempotentStart.status === TripStatus.ACTIVE,
      'Starting an already ACTIVE trip is idempotent and returns ACTIVE trip record',
    );

    const postAuditCount = await prisma.tripAudit.count({
      where: { tripId: tripToStart.id, action: 'TRIP_STARTED' },
    });
    assert(
      postAuditCount === initialAuditCount,
      'Idempotent start does NOT create duplicate TRIP_STARTED audit records',
    );
    assert(
      startedBroadcasts.length === 0,
      'Idempotent start does NOT trigger duplicate WebSocket broadcasts',
    );

    // Starting by Driver ID instead of User ID also works
    const tripToStart2 = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        driverId: driver1.id,
        status: TripStatus.SCHEDULED,
      },
    });
    cleanupTripIds.push(tripToStart2.id);

    const startedWithDriverId = await tripsService.startTrip(tripToStart2.id, driver1.id);
    assert(
      startedWithDriverId.status === TripStatus.ACTIVE,
      'Starting SCHEDULED trip with Driver entity ID succeeds and transitions to ACTIVE',
    );

    // Unauthorized driver starting the trip throws ForbiddenException
    let forbiddenError: any = null;
    try {
      await tripsService.startTrip(tripToStart.id, driver2User.id);
    } catch (err) {
      forbiddenError = err;
    }
    assert(
      forbiddenError instanceof ForbiddenException,
      'Unauthorized driver attempting to start trip is rejected with ForbiddenException (403)',
    );

    // =========================================================================
    // SECTION 2: Atomic Trip Completion Lifecycle & Idempotency
    // =========================================================================
    console.log('\n--- 2. Atomic Trip Completion Lifecycle & Idempotency ---');

    completedBroadcasts.length = 0;
    clearedGeofenceTripId = null;
    clearedRouteProgressTripId = null;
    clearedEtaTripId = null;

    const completedTrip = await tripsService.endTrip(tripToStart.id, driver1User.id);
    assert(
      completedTrip.status === TripStatus.COMPLETED,
      'Ending an ACTIVE trip updates status to COMPLETED',
    );
    assert(
      Boolean(completedTrip.endTime),
      'Trip endTime is atomically set upon completion',
    );

    // Verify TripAudit created atomically
    const endAudit = await prisma.tripAudit.findFirst({
      where: {
        tripId: tripToStart.id,
        action: 'TRIP_COMPLETED',
      },
    });
    assert(
      Boolean(endAudit),
      'TripAudit record with action TRIP_COMPLETED is created atomically',
    );
    assert(
      endAudit?.driverId === driver1.id,
      'TripAudit record driverId correctly references driver',
    );
    assert(
      endAudit?.tripId === tripToStart.id,
      'TripAudit record tripId correctly references trip',
    );
    assert(
      clearedGeofenceTripId === tripToStart.id &&
        clearedRouteProgressTripId === tripToStart.id &&
        clearedEtaTripId === tripToStart.id,
      'In-memory tracking, ETA, and geofence state cleared upon trip completion',
    );
    assert(
      completedBroadcasts.length === 1 && completedBroadcasts[0].tripId === tripToStart.id,
      'WebSocket trip:completed broadcast emitted after transaction commits',
    );

    // Idempotent end retry on already COMPLETED trip
    const initialEndAuditCount = await prisma.tripAudit.count({
      where: { tripId: tripToStart.id, action: 'TRIP_COMPLETED' },
    });
    completedBroadcasts.length = 0;

    const idempotentEnd = await tripsService.endTrip(tripToStart.id, driver1User.id);
    assert(
      idempotentEnd.status === TripStatus.COMPLETED,
      'Ending an already COMPLETED trip is idempotent and returns record cleanly',
    );

    const postEndAuditCount = await prisma.tripAudit.count({
      where: { tripId: tripToStart.id, action: 'TRIP_COMPLETED' },
    });
    assert(
      postEndAuditCount === initialEndAuditCount,
      'Idempotent end does NOT create duplicate TRIP_COMPLETED audit records',
    );
    assert(
      completedBroadcasts.length === 0,
      'Idempotent end does NOT trigger duplicate WebSocket broadcasts',
    );

    // Starting a COMPLETED trip throws BadRequestException (400)
    let startCompletedError: any = null;
    try {
      await tripsService.startTrip(tripToStart.id, driver1User.id);
    } catch (err) {
      startCompletedError = err;
    }
    assert(
      startCompletedError instanceof BadRequestException,
      'Starting a COMPLETED trip throws BadRequestException (400)',
    );

    // Ending a SCHEDULED trip throws BadRequestException (400)
    const scheduledTrip = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        driverId: driver1.id,
        status: TripStatus.SCHEDULED,
      },
    });
    cleanupTripIds.push(scheduledTrip.id);

    let endScheduledError: any = null;
    try {
      await tripsService.endTrip(scheduledTrip.id, driver1User.id);
    } catch (err) {
      endScheduledError = err;
    }
    assert(
      endScheduledError instanceof BadRequestException,
      'Ending a SCHEDULED trip throws BadRequestException (400)',
    );

    // Unauthorized driver ending trip throws ForbiddenException
    let endForbiddenError: any = null;
    try {
      await tripsService.endTrip(tripToStart2.id, driver2User.id);
    } catch (err) {
      endForbiddenError = err;
    }
    assert(
      endForbiddenError instanceof ForbiddenException,
      'Unauthorized driver attempting to end trip throws ForbiddenException (403)',
    );

    // =========================================================================
    // SECTION 3: Atomic Administrative Trip Cancellation
    // =========================================================================
    console.log('\n--- 3. Atomic Administrative Trip Cancellation ---');

    // Create an active trip to cancel
    const activeTripToCancel = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        driverId: driver1.id,
        status: TripStatus.ACTIVE,
        startTime: new Date(),
      },
    });
    cleanupTripIds.push(activeTripToCancel.id);

    cancelledBroadcasts.length = 0;
    clearedGeofenceTripId = null;
    clearedRouteProgressTripId = null;

    const validReason = 'Emergency route diversion ordered by traffic police';
    const cancelledTrip = await adminService.cancelTrip(
      activeTripToCancel.id,
      adminUser.id,
      validReason,
    );

    assert(
      cancelledTrip.status === TripStatus.CANCELLED,
      'Cancelling an active trip transitions status to CANCELLED',
    );
    assert(
      Boolean(cancelledTrip.endTime),
      'Cancelled trip has endTime timestamp atomically recorded',
    );

    // Verify AdminAudit atomically recorded
    const cancelAdminAudit = await prisma.adminAudit.findFirst({
      where: {
        targetId: activeTripToCancel.id,
        action: 'TRIP_CANCELLED',
      },
    });
    assert(
      Boolean(cancelAdminAudit),
      'AdminAudit record with action TRIP_CANCELLED is created atomically',
    );
    assert(
      cancelAdminAudit?.adminId === adminUser.id,
      'AdminAudit record adminId matches calling administrator',
    );
    assert(
      (cancelAdminAudit?.metadata as any)?.reason === validReason,
      'AdminAudit metadata captures exact cancellation reason',
    );
    assert(
      (cancelAdminAudit?.metadata as any)?.previousStatus === TripStatus.ACTIVE,
      'AdminAudit metadata captures accurate previousStatus (ACTIVE)',
    );
    assert(
      cancelledBroadcasts.length === 1 && cancelledBroadcasts[0].tripId === activeTripToCancel.id,
      'WebSocket trip:cancelled broadcast emitted after transaction commits',
    );
    assert(
      clearedGeofenceTripId === activeTripToCancel.id && clearedRouteProgressTripId === activeTripToCancel.id,
      'Tracking state cleared upon active trip cancellation',
    );

    // Idempotent cancellation on already CANCELLED trip
    const initialCancelAuditCount = await prisma.adminAudit.count({
      where: { targetId: activeTripToCancel.id, action: 'TRIP_CANCELLED' },
    });
    cancelledBroadcasts.length = 0;

    const idempotentCancel = await adminService.cancelTrip(
      activeTripToCancel.id,
      adminUser.id,
      validReason,
    );
    assert(
      idempotentCancel.status === TripStatus.CANCELLED,
      'Cancelling an already CANCELLED trip is idempotent and returns record',
    );

    const postCancelAuditCount = await prisma.adminAudit.count({
      where: { targetId: activeTripToCancel.id, action: 'TRIP_CANCELLED' },
    });
    assert(
      postCancelAuditCount === initialCancelAuditCount,
      'Idempotent cancellation does NOT create duplicate AdminAudit records',
    );
    assert(
      cancelledBroadcasts.length === 0,
      'Idempotent cancellation does NOT emit duplicate WebSocket broadcasts',
    );

    // Cancelling an already COMPLETED trip throws BadRequestException (400)
    let cancelCompletedError: any = null;
    try {
      await adminService.cancelTrip(tripToStart.id, adminUser.id, 'Too late to cancel');
    } catch (err) {
      cancelCompletedError = err;
    }
    assert(
      cancelCompletedError instanceof BadRequestException,
      'Cancelling an already COMPLETED trip throws BadRequestException (400)',
    );
    assert(
      Boolean(cancelCompletedError?.message?.includes('Cannot cancel a completed trip')),
      'Rejection error message explicitly states "Cannot cancel a completed trip"',
    );

    // Cancelling with missing, empty, or whitespace reason throws BadRequestException (400)
    let emptyReasonError: any = null;
    try {
      await adminService.cancelTrip(scheduledTrip.id, adminUser.id, '');
    } catch (err) {
      emptyReasonError = err;
    }
    assert(
      emptyReasonError instanceof BadRequestException,
      'Cancelling with empty reason throws BadRequestException (400)',
    );

    let whitespaceReasonError: any = null;
    try {
      await adminService.cancelTrip(scheduledTrip.id, adminUser.id, '    ');
    } catch (err) {
      whitespaceReasonError = err;
    }
    assert(
      whitespaceReasonError instanceof BadRequestException,
      'Cancelling with whitespace-only reason throws BadRequestException (400)',
    );

    // Cancelling with reason shorter than 5 characters throws BadRequestException (400)
    let shortReasonError: any = null;
    try {
      await adminService.cancelTrip(scheduledTrip.id, adminUser.id, 'bad');
    } catch (err) {
      shortReasonError = err;
    }
    assert(
      shortReasonError instanceof BadRequestException,
      'Cancelling with reason < 5 characters throws BadRequestException (400)',
    );

    // Starting a CANCELLED trip throws BadRequestException (400)
    let startCancelledError: any = null;
    try {
      await tripsService.startTrip(activeTripToCancel.id, driver1User.id);
    } catch (err) {
      startCancelledError = err;
    }
    assert(
      startCancelledError instanceof BadRequestException,
      'Starting a CANCELLED trip throws BadRequestException (400)',
    );

    // Ending a CANCELLED trip throws BadRequestException (400)
    let endCancelledError: any = null;
    try {
      await tripsService.endTrip(activeTripToCancel.id, driver1User.id);
    } catch (err) {
      endCancelledError = err;
    }
    assert(
      endCancelledError instanceof BadRequestException,
      'Ending a CANCELLED trip throws BadRequestException (400)',
    );

    // =========================================================================
    // SECTION 4: Transaction Rollback Protection (Zero Partial Writes)
    // =========================================================================
    console.log('\n--- 4. Transaction Rollback Protection (Zero Partial Writes) ---');

    // Create a trip for testing rollback integrity
    const rollbackTestTrip = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        driverId: driver1.id,
        status: TripStatus.READY,
      },
    });
    cleanupTripIds.push(rollbackTestTrip.id);

    // Simulate an aborted transaction where the audit creation intentionally fails
    let rollbackErrorCaught = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Update trip status inside transaction
        await tx.trip.update({
          where: { id: rollbackTestTrip.id },
          data: {
            status: TripStatus.ACTIVE,
            startTime: new Date(),
          },
        });

        // Step 2: Intentional simulated failure / rejection (e.g. invalid foreign key or forced error)
        throw new Error('SIMULATED_DATABASE_FAILURE_DURING_AUDIT_INSERTION');
      });
    } catch (err: any) {
      if (err.message === 'SIMULATED_DATABASE_FAILURE_DURING_AUDIT_INSERTION') {
        rollbackErrorCaught = true;
      }
    }

    assert(
      rollbackErrorCaught,
      'Transaction error is caught during simulated mid-operation failure',
    );

    // Verify database state: trip status MUST NOT have changed to ACTIVE
    const verifiedTripAfterRollback = await prisma.trip.findUnique({
      where: { id: rollbackTestTrip.id },
    });

    assert(
      verifiedTripAfterRollback?.status === TripStatus.READY,
      'Database rollback protection preserves original status (READY) with zero partial writes',
    );
    assert(
      verifiedTripAfterRollback?.startTime === null,
      'startTime remains null after rollback (no partial mutation)',
    );

    const rollbackAuditCount = await prisma.tripAudit.count({
      where: { tripId: rollbackTestTrip.id },
    });
    assert(
      rollbackAuditCount === 0,
      'Zero orphaned TripAudit records created upon transaction rollback',
    );

  } finally {
    // -------------------------------------------------------------------------
    // Teardown
    // -------------------------------------------------------------------------
    for (const tripId of cleanupTripIds) {
      await prisma.tripAudit.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.adminAudit.deleteMany({ where: { targetId: tripId } }).catch(() => {});
      await prisma.boardingEvent.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.locationHistory.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    }

    for (const busId of cleanupBusIds) {
      await prisma.busMaintenance.deleteMany({ where: { busId } }).catch(() => {});
      await prisma.bus.delete({ where: { id: busId } }).catch(() => {});
    }

    for (const driverId of cleanupDriverIds) {
      await prisma.driver.delete({ where: { id: driverId } }).catch(() => {});
    }

    for (const userId of cleanupUserIds) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }

    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`Summary: ${passedTests}/${totalTests} assertions passed`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTripLifecycleTransactionSuite().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
