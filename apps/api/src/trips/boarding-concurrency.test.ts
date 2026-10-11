import { PrismaClient, TripStatus, BoardingEventType, Role } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { RouteProgressService } from './route-progress.service';
import { GeofenceService } from './geofence.service';
import { TripsGateway } from './trips.gateway';
import { EtaService } from './eta.service';
import { PrismaService } from '../prisma/prisma.module';
import { calculateTripOccupancy } from '../common/utils/eta.util';

async function runBoardingConcurrencyVerification() {
  console.log('========================================================================');
  console.log('🧪 Step 6: Boarding/Drop-Off Concurrency & Data Minimization Test Suite');
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

  // Tracking for teardown
  const createdPickupAssignmentIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdTripIds: string[] = [];
  const createdBusIds: string[] = [];
  const createdRouteStopIds: string[] = [];
  const createdStopIds: string[] = [];
  const createdRouteIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Mock Services & TripsService Setup
    // -------------------------------------------------------------------------
    const emittedEvents: Array<{ event: string; payload: any }> = [];
    const mockTripsGateway = {
      broadcastLocation: () => {},
      broadcastTripStarted: () => {},
      broadcastTripCompleted: () => {},
      broadcastTripCancelled: () => {},
      broadcastTripProgress: () => {},
      broadcastAdminSos: () => {},
      emitStudentEta: () => {},
      broadcastOccupancy: (_tripId: string, payload: any) => {
        emittedEvents.push({ event: 'trip:occupancy', payload });
      },
      emitBoardingConfirmed: (userId: string, payload: any) => {
        emittedEvents.push({ event: 'boarding:confirmed', payload: { userId, ...payload } });
      },
      emitDropoffConfirmed: (userId: string, payload: any) => {
        emittedEvents.push({ event: 'dropoff:confirmed', payload: { userId, ...payload } });
      },
    } as unknown as TripsGateway;

    const geofenceService = new GeofenceService(prisma, mockTripsGateway, {} as any);
    const routeProgressService = new RouteProgressService(prisma, geofenceService, mockTripsGateway);
    const etaService = new EtaService(prisma, mockTripsGateway);
    const tripsService = new TripsService(
      prisma,
      mockTripsGateway,
      geofenceService,
      routeProgressService,
      etaService,
    );

    // -------------------------------------------------------------------------
    // Setup Test Route, Stops, Bus, Driver, and Active Trip
    // -------------------------------------------------------------------------
    const uniqueSuffix = Date.now().toString().slice(-6);

    const testRouteA = await prisma.route.create({
      data: {
        name: `Route Alpha ${uniqueSuffix}`,
        active: true,
      },
    });
    createdRouteIds.push(testRouteA.id);

    const testRouteB = await prisma.route.create({
      data: {
        name: `Route Beta ${uniqueSuffix}`,
        active: true,
      },
    });
    createdRouteIds.push(testRouteB.id);

    const testStopA = await prisma.stop.create({
      data: {
        name: `Campus Stop ${uniqueSuffix}`,
        lat: 13.1340,
        lng: 77.5680,
      },
    });
    createdStopIds.push(testStopA.id);

    const testRouteStop = await prisma.routeStop.create({
      data: {
        routeId: testRouteA.id,
        stopId: testStopA.id,
        sequence: 1,
      },
    });
    createdRouteStopIds.push(testRouteStop.id);

    const testBus = await prisma.bus.create({
      data: {
        plateNumber: `BUS-CONC-${uniqueSuffix}`,
        capacity: 20,
        status: 'ACTIVE',
        isActive: true,
      },
    });
    createdBusIds.push(testBus.id);

    // Find driver
    const testDriver = await prisma.driver.findFirst({
      where: { active: true, isActive: true },
    });
    if (!testDriver) {
      throw new Error('Precondition failed: No active driver found.');
    }

    // Create Active Trip on Route A
    const activeTrip = await prisma.trip.create({
      data: {
        routeId: testRouteA.id,
        busId: testBus.id,
        driverId: testDriver.id,
        status: TripStatus.ACTIVE,
        startTime: new Date(),
      },
    });
    createdTripIds.push(activeTrip.id);

    // Create Inactive Trip on Route A
    const scheduledTrip = await prisma.trip.create({
      data: {
        routeId: testRouteA.id,
        busId: testBus.id,
        driverId: testDriver.id,
        status: TripStatus.SCHEDULED,
      },
    });
    createdTripIds.push(scheduledTrip.id);

    // Helper to create test student with active pickup assignment
    const createTestStudent = async (usnPrefix: string, routeId: string, stopId: string) => {
      const user = await prisma.user.create({
        data: {
          email: `${usnPrefix.toLowerCase()}-${uniqueSuffix}@test.bts.edu`,
          passwordHash: 'dummy-hash',
          role: Role.STUDENT,
        },
      });
      createdUserIds.push(user.id);

      const student = await prisma.student.create({
        data: {
          userId: user.id,
          usn: `${usnPrefix}-${uniqueSuffix}`,
        },
      });
      createdStudentIds.push(student.id);

      const pickup = await prisma.pickupAssignment.create({
        data: {
          studentId: student.id,
          routeId,
          stopId,
          active: true,
        },
      });
      createdPickupAssignmentIds.push(pickup.id);

      return { user, student, pickup };
    }

    const student1 = await createTestStudent('STU1', testRouteA.id, testStopA.id);
    const student2 = await createTestStudent('STU2', testRouteA.id, testStopA.id);
    const studentWrongRoute = await createTestStudent('STU-WRONG', testRouteB.id, testStopA.id);

    // =========================================================================
    // 1. DUPLICATE BOARD IDEMPOTENCY (PARALLEL CONCURRENCY)
    // =========================================================================
    console.log('--- 1. Duplicate BOARD Idempotency (Parallel Concurrency) ---');

    // Rapid-fire 5 concurrent parallel requests for Student 1
    const parallelBoardPromises = [
      tripsService.boardTrip(activeTrip.id, student1.user.id),
      tripsService.boardTrip(activeTrip.id, student1.user.id),
      tripsService.boardTrip(activeTrip.id, student1.user.id),
      tripsService.boardTrip(activeTrip.id, student1.user.id),
      tripsService.boardTrip(activeTrip.id, student1.user.id),
    ];

    const boardResults = await Promise.all(parallelBoardPromises);

    assert(
      boardResults.every((r) => r.success === true),
      'All concurrent boarding requests resolve with success: true',
    );

    // Count BOARD events in database for student1
    const student1BoardCount = await prisma.boardingEvent.count({
      where: {
        studentId: student1.student.id,
        tripId: activeTrip.id,
        type: BoardingEventType.BOARD,
      },
    });

    assert(
      student1BoardCount === 1,
      'Exactly 1 BOARD event inserted into database despite 5 parallel concurrent requests',
    );

    const firstCreated = boardResults.find((r) => !r.idempotent);
    const idempotentResponses = boardResults.filter((r) => r.idempotent);

    assert(Boolean(firstCreated), 'Initial request records creation');
    assert(
      idempotentResponses.length === 4,
      '4 duplicate concurrent requests handled cleanly as idempotent responses',
    );

    // Verify occupancy was incremented exactly once (occupiedSeats: 1)
    const tripAfterBoard: any = await tripsService.getTripById(activeTrip.id);
    assert(
      tripAfterBoard.currentOccupancy === 1,
      'Occupancy not inflated by duplicate concurrent BOARD requests (currentOccupancy: 1)',
    );

    // =========================================================================
    // 2. DUPLICATE DROP IDEMPOTENCY (PARALLEL CONCURRENCY)
    // =========================================================================
    console.log('\n--- 2. Duplicate DROP Idempotency (Parallel Concurrency) ---');

    // Rapid-fire 5 concurrent parallel drop requests for Student 1
    const parallelDropPromises = [
      tripsService.dropTrip(activeTrip.id, student1.user.id),
      tripsService.dropTrip(activeTrip.id, student1.user.id),
      tripsService.dropTrip(activeTrip.id, student1.user.id),
      tripsService.dropTrip(activeTrip.id, student1.user.id),
      tripsService.dropTrip(activeTrip.id, student1.user.id),
    ];

    const dropResults = await Promise.all(parallelDropPromises);

    assert(
      dropResults.every((r) => r.success === true),
      'All concurrent drop requests resolve with success: true',
    );

    const student1DropCount = await prisma.boardingEvent.count({
      where: {
        studentId: student1.student.id,
        tripId: activeTrip.id,
        type: BoardingEventType.DROP,
      },
    });

    assert(
      student1DropCount === 1,
      'Exactly 1 DROP event inserted into database despite 5 parallel concurrent requests',
    );

    const dropIdempotentResponses = dropResults.filter((r) => r.idempotent);
    assert(
      dropIdempotentResponses.length === 4,
      '4 duplicate concurrent DROP requests handled cleanly as idempotent responses',
    );

    // Verify occupancy decremented to 0 without going negative
    const tripAfterDrop: any = await tripsService.getTripById(activeTrip.id);
    assert(
      tripAfterDrop.currentOccupancy === 0,
      'Occupancy cleanly decremented to 0 and clamped without negative leakage',
    );

    // =========================================================================
    // 3. INVALID DROP REJECTION (NO PRIOR BOARDING)
    // =========================================================================
    console.log('\n--- 3. Invalid DROP Rejection (No Prior Boarding) ---');

    // Student 2 has not boarded activeTrip
    let caughtInvalidDrop = false;
    let invalidDropMessage = '';
    try {
      await tripsService.dropTrip(activeTrip.id, student2.user.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtInvalidDrop = true;
        invalidDropMessage = err.message;
      }
    }

    assert(
      caughtInvalidDrop,
      'Attempting to drop/check-out without prior check-in rejected with 400 BadRequestException',
    );
    assert(
      invalidDropMessage.includes('Student is not currently boarded on this trip'),
      'Error message states "Student is not currently boarded on this trip"',
    );

    // =========================================================================
    // 4. TOKEN IDENTITY ENFORCEMENT & SECURITY
    // =========================================================================
    console.log('\n--- 4. Token Identity Enforcement & Security ---');

    // Attempt to pass spoofed studentId in request body while authenticated as Student 2
    const spoofedBody = { studentId: student1.student.id, extraField: 'malicious-data' };
    const boardWithSpoof = await tripsService.boardTrip(
      activeTrip.id,
      student2.user.id,
      spoofedBody,
    );

    assert(boardWithSpoof.success === true, 'Boarding succeeds for authenticated student');

    const student2BoardEvent = await prisma.boardingEvent.findFirst({
      where: {
        tripId: activeTrip.id,
        studentId: student2.student.id,
        type: BoardingEventType.BOARD,
      },
    });

    assert(
      Boolean(student2BoardEvent),
      'Boarding record strictly bound to authenticated JWT user (student 2)',
    );
    assert(
      student2BoardEvent?.studentId === student2.student.id,
      'Spoofed studentId in request body is strictly ignored',
    );

    // Clean up student2 boarding for subsequent tests
    await tripsService.dropTrip(activeTrip.id, student2.user.id);

    // =========================================================================
    // 5. WRONG TRIP & ROUTE ACCESS PROTECTION
    // =========================================================================
    console.log('\n--- 5. Wrong Trip & Route Access Protection ---');

    // 5.1 Boarding non-active trip throws 400
    let caughtInactiveTrip = false;
    try {
      await tripsService.boardTrip(scheduledTrip.id, student1.user.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtInactiveTrip = true;
      }
    }
    assert(
      caughtInactiveTrip,
      'Boarding a non-ACTIVE trip (SCHEDULED) strictly rejected with 400 BadRequestException',
    );

    // 5.2 Boarding non-existent trip throws 404
    let caughtMissingTrip = false;
    try {
      await tripsService.boardTrip('non-existent-trip-id', student1.user.id);
    } catch (err: any) {
      if (err instanceof NotFoundException && err.getStatus() === 404) {
        caughtMissingTrip = true;
      }
    }
    assert(
      caughtMissingTrip,
      'Boarding a non-existent trip strictly rejected with 404 NotFoundException',
    );

    // 5.3 Student assigned to different route throws 400
    let caughtWrongRoute = false;
    try {
      await tripsService.boardTrip(activeTrip.id, studentWrongRoute.user.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtWrongRoute = true;
      }
    }
    assert(
      caughtWrongRoute,
      'Student with pickup stop on Route Beta cannot board Route Alpha trip (400)',
    );

    // =========================================================================
    // 6. OCCUPANCY MATHEMATICAL INTEGRITY (10 BOARDS + 10 DROPS)
    // =========================================================================
    console.log('\n--- 6. Occupancy Mathematical Integrity (10 Boards + 10 Drops) ---');

    // Clean prior test boardings on activeTrip to ensure exact 0 baseline
    await prisma.boardingEvent.deleteMany({
      where: { tripId: activeTrip.id },
    });

    // Create 10 dedicated students on Route A
    const testBatchStudents = [];
    for (let i = 1; i <= 10; i++) {
      const batchStudent = await createTestStudent(`BATCH${i}`, testRouteA.id, testStopA.id);
      testBatchStudents.push(batchStudent);
    }

    // Board all 10 students
    for (const s of testBatchStudents) {
      await tripsService.boardTrip(activeTrip.id, s.user.id);
    }

    // Verify net passengers and occupancy percentage (10 / 20 capacity = 50%)
    const trip10Boarded: any = await tripsService.getTripById(activeTrip.id);
    assert(
      trip10Boarded.currentOccupancy === 10,
      'Net passengers correctly reaches 10 after 10 student boardings',
    );
    assert(
      trip10Boarded.occupancyPercentage === 50,
      'Occupancy percentage accurately calculates to 50% (10 / 20 capacity)',
    );
    assert(
      trip10Boarded.occupancyStatus === 'SEATS_AVAILABLE',
      'Occupancy status categorized as SEATS_AVAILABLE at 50%',
    );

    // Drop all 10 students
    for (const s of testBatchStudents) {
      await tripsService.dropTrip(activeTrip.id, s.user.id);
    }

    // Verify return to 0
    const trip10Dropped: any = await tripsService.getTripById(activeTrip.id);
    assert(
      trip10Dropped.currentOccupancy === 0,
      'Net passengers returns exactly to 0 after 10 drops',
    );
    assert(
      trip10Dropped.occupancyPercentage === 0,
      'Occupancy percentage returns exactly to 0%',
    );

    // Mathematical formula unit verification
    const clampedUnderflow = calculateTripOccupancy(2, 5, 20);
    assert(
      clampedUnderflow.netPassengers === 0 && clampedUnderflow.occupancyPercentage === 0,
      'calculateTripOccupancy strictly clamps negative board-drop difference to 0',
    );

    const clampedOverflow = calculateTripOccupancy(25, 0, 20);
    assert(
      clampedOverflow.netPassengers === 20 && clampedOverflow.occupancyPercentage === 100,
      'calculateTripOccupancy strictly clamps overflow passengers to vehicle capacity (20)',
    );
    assert(
      clampedOverflow.occupancyStatus === 'FULL',
      'Occupancy status categorized as FULL at 100%',
    );

    const standingRoom = calculateTripOccupancy(16, 0, 20);
    assert(
      standingRoom.occupancyPercentage === 80 && standingRoom.occupancyStatus === 'STANDING_ROOM_ONLY',
      'Occupancy status categorized as STANDING_ROOM_ONLY at 80%',
    );

    // =========================================================================
    // 7. OPERATIONAL DATA MINIMIZATION (STUDENT & DRIVER INTERFACES)
    // =========================================================================
    console.log('\n--- 7. Operational Data Minimization (Student & Driver Views) ---');

    // 7.1 Student view of GET /trips/:id
    const studentViewTrip = await tripsService.getTripById(activeTrip.id, {
      id: student1.user.id,
      role: 'STUDENT',
    });

    assert(
      !('currentOccupancy' in studentViewTrip),
      'Raw currentOccupancy headcount suppressed in student GET /trips/:id response',
    );
    assert(
      !('boardings' in studentViewTrip),
      'Raw boardings student roster array suppressed in student GET /trips/:id response',
    );
    assert(
      typeof studentViewTrip.occupancyPercent === 'number',
      'Occupancy percent exposed to student view',
    );
    assert(
      typeof studentViewTrip.occupancyStatus === 'string',
      'Categorical occupancyStatus exposed to student view',
    );

    // 7.2 Driver view of GET /trips/:id
    const driverViewTrip = await tripsService.getTripById(activeTrip.id, {
      id: testDriver.userId,
      role: 'DRIVER',
    });

    assert(
      !('currentOccupancy' in driverViewTrip),
      'Raw currentOccupancy headcount suppressed in driver GET /trips/:id response',
    );
    assert(
      !('boardings' in driverViewTrip),
      'Raw boardings student roster array suppressed in driver GET /trips/:id response',
    );

    // 7.3 Student view of GET /trips/active
    const studentActiveTrips = await tripsService.getActiveTrips({
      id: student1.user.id,
      role: 'STUDENT',
    });

    assert(
      studentActiveTrips.length > 0,
      'GET /trips/active returns active trips list',
    );
    assert(
      !('calculatedOccupancy' in studentActiveTrips[0]),
      'Raw calculatedOccupancy headcount suppressed in student GET /trips/active response',
    );
    assert(
      !('boardings' in studentActiveTrips[0]),
      'Raw boardings array suppressed in student GET /trips/active response',
    );
    assert(
      typeof studentActiveTrips[0].occupancyPercent === 'number',
      'occupancyPercent present in student GET /trips/active response',
    );

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n========================================================================');
    console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
    console.log('========================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL STEP 6 BOARDING CONCURRENCY ASSERTIONS PASSED CLEANLY!\n');
    } else {
      console.error('❌ SOME ASSERTIONS FAILED.');
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error('Fatal test error in boarding concurrency tests:', err);
    process.exitCode = 1;
  } finally {
    // Teardown
    if (createdTripIds.length > 0) {
      await prisma.boardingEvent.deleteMany({ where: { tripId: { in: createdTripIds } } }).catch(() => {});
      await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } }).catch(() => {});
    }
    if (createdPickupAssignmentIds.length > 0) {
      await prisma.pickupAssignment.deleteMany({ where: { id: { in: createdPickupAssignmentIds } } }).catch(() => {});
    }
    if (createdStudentIds.length > 0) {
      await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    if (createdRouteStopIds.length > 0) {
      await prisma.routeStop.deleteMany({ where: { id: { in: createdRouteStopIds } } }).catch(() => {});
    }
    if (createdStopIds.length > 0) {
      await prisma.stop.deleteMany({ where: { id: { in: createdStopIds } } }).catch(() => {});
    }
    if (createdBusIds.length > 0) {
      await prisma.bus.deleteMany({ where: { id: { in: createdBusIds } } }).catch(() => {});
    }
    if (createdRouteIds.length > 0) {
      await prisma.route.deleteMany({ where: { id: { in: createdRouteIds } } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runBoardingConcurrencyVerification();
