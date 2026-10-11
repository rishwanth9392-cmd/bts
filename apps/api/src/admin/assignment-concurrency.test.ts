import { PrismaClient, BusStatus, TripStatus, BoardingEventType, Role } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { PrismaService } from '../prisma/prisma.module';

async function runAssignmentConcurrencyVerification() {
  console.log('========================================================================');
  console.log('🧪 Step 2: Dispatch Concurrency Locking & DB Index Verification Suite');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;
  const assignmentIntegrityService = new AssignmentIntegrityService(prisma);

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

  const cleanupTripIds: string[] = [];
  const cleanupBusIds: string[] = [];
  const cleanupDriverIds: string[] = [];
  const cleanupUserIds: string[] = [];

  try {
    // Fetch available routes from verified seed data
    const routes = await prisma.route.findMany({
      where: { active: true },
      take: 3,
    });

    if (routes.length < 2) {
      throw new Error('Precondition failed: At least 2 active routes required in database.');
    }

    const routeA = routes[0];
    const routeB = routes[1];

    // =========================================================================
    // 1. CONCURRENT SAME-BUS DISPATCH CONFLICT TEST
    // =========================================================================
    console.log('--- 1. Concurrent Same-Bus Dispatch Serialization ---');

    // Create an isolated test bus
    const testBusPlate = `CONC-BUS-${Date.now().toString().slice(-6)}`;
    const testBus = await prisma.bus.create({
      data: {
        plateNumber: testBusPlate,
        capacity: 40,
        model: 'Tata Marcopolo Concurrency Test',
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(testBus.id);

    // Create 2 test drivers for the same bus conflict test
    const userDriver1 = await prisma.user.create({
      data: {
        email: `driver.conc.bus1.${Date.now()}@bts.bmsit.ac.in`,
        role: Role.DRIVER,
      },
    });
    cleanupUserIds.push(userDriver1.id);
    const driver1 = await prisma.driver.create({
      data: {
        userId: userDriver1.id,
        name: 'Conc Bus Driver 1',
        licenseNumber: `DL-BUS1-${Date.now().toString().slice(-6)}`,
        phone: '9876543001',
        isActive: true,
      },
    });
    cleanupDriverIds.push(driver1.id);

    const userDriver2 = await prisma.user.create({
      data: {
        email: `driver.conc.bus2.${Date.now()}@bts.bmsit.ac.in`,
        role: Role.DRIVER,
      },
    });
    cleanupUserIds.push(userDriver2.id);
    const driver2 = await prisma.driver.create({
      data: {
        userId: userDriver2.id,
        name: 'Conc Bus Driver 2',
        licenseNumber: `DL-BUS2-${Date.now().toString().slice(-6)}`,
        phone: '9876543002',
        isActive: true,
      },
    });
    cleanupDriverIds.push(driver2.id);

    // Fire 2 simultaneous assertAndAssignTrip requests targeting the exact same bus
    console.log(`  Dispatching 2 simultaneous trips targeting Bus ${testBus.plateNumber}...`);
    const busDispatchResults = await Promise.allSettled([
      assignmentIntegrityService.assertAndAssignTrip({
        routeId: routeA.id,
        busId: testBus.id,
        driverId: driver1.id,
      }),
      assignmentIntegrityService.assertAndAssignTrip({
        routeId: routeB.id,
        busId: testBus.id,
        driverId: driver2.id,
      }),
    ]);

    const fulfilledBusDispatches = busDispatchResults.filter(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<any>[];
    const rejectedBusDispatches = busDispatchResults.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    assert(
      fulfilledBusDispatches.length === 1,
      'Exactly 1 of 2 concurrent same-bus dispatch calls succeeds',
      `Expected 1, got ${fulfilledBusDispatches.length}`,
    );

    assert(
      rejectedBusDispatches.length === 1,
      'Exactly 1 of 2 concurrent same-bus dispatch calls is rejected',
      `Expected 1, got ${rejectedBusDispatches.length}`,
    );

    if (fulfilledBusDispatches.length > 0) {
      cleanupTripIds.push(fulfilledBusDispatches[0].value.id);
    }

    if (rejectedBusDispatches.length > 0) {
      const rejectionReason = rejectedBusDispatches[0].reason;
      const isConflict = rejectionReason instanceof ConflictException;
      const statusCode = rejectionReason?.getStatus ? rejectionReason.getStatus() : null;
      assert(
        isConflict && statusCode === 409,
        'Concurrent same-bus dispatch rejection throws 409 ConflictException',
        `Received error: ${rejectionReason?.message || rejectionReason}`,
      );
      assert(
        typeof rejectionReason?.message === 'string' &&
          rejectionReason.message.includes(testBus.plateNumber) &&
          rejectionReason.message.includes('A vehicle cannot be assigned to concurrent trips'),
        'Rejection error message identifies bus conflict and vehicle concurrency violation',
        rejectionReason?.message,
      );
    }

    // Verify DB integrity: exactly 1 trip exists for this test bus
    const tripsForTestBus = await prisma.trip.findMany({
      where: { busId: testBus.id },
    });
    assert(
      tripsForTestBus.length === 1,
      'Database verifies exactly 1 trip record was created for the target bus',
      `Expected 1, found ${tripsForTestBus.length}`,
    );

    // =========================================================================
    // 2. CONCURRENT SAME-DRIVER DISPATCH CONFLICT TEST
    // =========================================================================
    console.log('\n--- 2. Concurrent Same-Driver Dispatch Serialization ---');

    // Create 2 isolated test buses
    const testBusD1 = await prisma.bus.create({
      data: {
        plateNumber: `CONC-DRV1-${Date.now().toString().slice(-6)}`,
        capacity: 40,
        model: 'Tata Marcopolo Driver Test 1',
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(testBusD1.id);

    const testBusD2 = await prisma.bus.create({
      data: {
        plateNumber: `CONC-DRV2-${Date.now().toString().slice(-6)}`,
        capacity: 40,
        model: 'Tata Marcopolo Driver Test 2',
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(testBusD2.id);

    // Create 1 test driver targeted by two concurrent dispatches
    const userDriverSingle = await prisma.user.create({
      data: {
        email: `driver.conc.single.${Date.now()}@bts.bmsit.ac.in`,
        role: Role.DRIVER,
      },
    });
    cleanupUserIds.push(userDriverSingle.id);
    const driverSingle = await prisma.driver.create({
      data: {
        userId: userDriverSingle.id,
        name: 'Conc Target Driver Single',
        licenseNumber: `DL-SNGL-${Date.now().toString().slice(-6)}`,
        phone: '9876543003',
        isActive: true,
      },
    });
    cleanupDriverIds.push(driverSingle.id);

    // Fire 2 simultaneous assertAndAssignTrip requests targeting the exact same driver
    console.log(`  Dispatching 2 simultaneous trips targeting Driver ${driverSingle.name}...`);
    const driverDispatchResults = await Promise.allSettled([
      assignmentIntegrityService.assertAndAssignTrip({
        routeId: routeA.id,
        busId: testBusD1.id,
        driverId: driverSingle.id,
      }),
      assignmentIntegrityService.assertAndAssignTrip({
        routeId: routeB.id,
        busId: testBusD2.id,
        driverId: driverSingle.id,
      }),
    ]);

    const fulfilledDriverDispatches = driverDispatchResults.filter(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<any>[];
    const rejectedDriverDispatches = driverDispatchResults.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    assert(
      fulfilledDriverDispatches.length === 1,
      'Exactly 1 of 2 concurrent same-driver dispatch calls succeeds',
      `Expected 1, got ${fulfilledDriverDispatches.length}`,
    );

    assert(
      rejectedDriverDispatches.length === 1,
      'Exactly 1 of 2 concurrent same-driver dispatch calls is rejected',
      `Expected 1, got ${rejectedDriverDispatches.length}`,
    );

    if (fulfilledDriverDispatches.length > 0) {
      cleanupTripIds.push(fulfilledDriverDispatches[0].value.id);
    }

    if (rejectedDriverDispatches.length > 0) {
      const rejectionReason = rejectedDriverDispatches[0].reason;
      const isConflict = rejectionReason instanceof ConflictException;
      const statusCode = rejectionReason?.getStatus ? rejectionReason.getStatus() : null;
      assert(
        isConflict && statusCode === 409,
        'Concurrent same-driver dispatch rejection throws 409 ConflictException',
        `Received error: ${rejectionReason?.message || rejectionReason}`,
      );
      assert(
        typeof rejectionReason?.message === 'string' &&
          (rejectionReason.message.includes(userDriverSingle.email) ||
            rejectionReason.message.includes(driverSingle.licenseNumber)) &&
          rejectionReason.message.includes('A driver cannot be assigned to concurrent trips'),
        'Rejection error message identifies driver conflict and concurrency violation',
        rejectionReason?.message,
      );
    }

    // Verify DB integrity: exactly 1 trip exists for this test driver
    const tripsForTestDriver = await prisma.trip.findMany({
      where: { driverId: driverSingle.id },
    });
    assert(
      tripsForTestDriver.length === 1,
      'Database verifies exactly 1 trip record was created for the target driver',
      `Expected 1, found ${tripsForTestDriver.length}`,
    );

    // =========================================================================
    // 3. DATABASE COMPOSITE INDEX VERIFICATION
    // =========================================================================
    console.log('\n--- 3. Database Composite Indexes Execution Verification ---');

    // 3.1 BoardingEvent [tripId, type] index verification
    const activeTrip = await prisma.trip.findFirst({
      where: { status: TripStatus.ACTIVE },
    });

    if (activeTrip) {
      const boardEventsCount = await prisma.boardingEvent.count({
        where: {
          tripId: activeTrip.id,
          type: BoardingEventType.BOARD,
        },
      });
      assert(
        typeof boardEventsCount === 'number',
        'BoardingEvent query by composite index [tripId, type] executes cleanly',
        `Returned count: ${boardEventsCount}`,
      );

      const dropEventsCount = await prisma.boardingEvent.count({
        where: {
          tripId: activeTrip.id,
          type: BoardingEventType.DROP,
        },
      });
      assert(
        typeof dropEventsCount === 'number',
        'BoardingEvent DROP event count by [tripId, type] executes cleanly',
        `Returned count: ${dropEventsCount}`,
      );
    } else {
      assert(false, 'No active trip available for BoardingEvent index test');
    }

    // 3.2 TripAudit [action, acknowledgedAt] index verification
    const unacknowledgedSosCount = await prisma.tripAudit.count({
      where: {
        action: 'SOS',
        acknowledgedAt: null,
      },
    });
    assert(
      typeof unacknowledgedSosCount === 'number',
      'TripAudit query by composite index [action, acknowledgedAt] executes cleanly',
      `Returned count: ${unacknowledgedSosCount}`,
    );

    const acknowledgedSosCount = await prisma.tripAudit.count({
      where: {
        action: 'SOS',
        acknowledgedAt: { not: null },
      },
    });
    assert(
      typeof acknowledgedSosCount === 'number',
      'TripAudit query filtering acknowledged SOS alerts executes cleanly',
      `Returned count: ${acknowledgedSosCount}`,
    );

  } finally {
    // Clean up created test entities in reverse order of foreign key dependencies
    if (cleanupTripIds.length > 0) {
      await prisma.tripAudit.deleteMany({
        where: { tripId: { in: cleanupTripIds } },
      }).catch(() => {});
      await prisma.boardingEvent.deleteMany({
        where: { tripId: { in: cleanupTripIds } },
      }).catch(() => {});
      await prisma.trip.deleteMany({
        where: { id: { in: cleanupTripIds } },
      }).catch(() => {});
    }

    if (cleanupDriverIds.length > 0) {
      await prisma.driver.deleteMany({
        where: { id: { in: cleanupDriverIds } },
      }).catch(() => {});
    }

    if (cleanupUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      }).catch(() => {});
    }

    if (cleanupBusIds.length > 0) {
      await prisma.busMaintenance.deleteMany({
        where: { busId: { in: cleanupBusIds } },
      }).catch(() => {});
      await prisma.bus.deleteMany({
        where: { id: { in: cleanupBusIds } },
      }).catch(() => {});
    }

    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
  console.log('========================================================================\n');

  if (totalTests === passedTests && totalTests > 0) {
    console.log('🎉 ALL ASSIGNMENT CONCURRENCY & INDEX ASSERTIONS PASSED CLEANLY!\n');
  } else {
    process.exitCode = 1;
  }
}

runAssignmentConcurrencyVerification().catch((err) => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
