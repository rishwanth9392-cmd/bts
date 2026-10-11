import { PrismaClient, BusStatus, TripStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { TripsGateway } from './trips.gateway';
import {
  TRIP_LOCATION,
  TRIP_PROGRESS,
  TRIP_OCCUPANCY,
  TRIP_STARTED,
  TRIP_COMPLETED,
  TripLocationPayload,
  TripProgressPayload,
  TripOccupancyPayload,
  TripLifecyclePayload,
} from '@bts/shared';

async function runWebsocketIsolationFanoutSuite() {
  console.log('========================================================================');
  console.log('🛡️ Step 5: WebSocket Isolation & Fanout Cleanup Verification Suite');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;

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
  const cleanupStudentIds: string[] = [];

  try {
    // =========================================================================
    // PREPARATION & TEST SEEDING
    // =========================================================================
    const routes = await prisma.route.findMany({
      where: { active: true },
      take: 2,
    });

    if (routes.length < 2) {
      throw new Error('Precondition failed: At least 2 active routes required in database.');
    }

    const routeA = routes[0];
    const routeB = routes[1];

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-ws-${Date.now()}@test.bmsit.ac.in`,
        passwordHash: 'dummy_hash',
        role: Role.ADMIN,
        active: true,
      },
    });
    cleanupUserIds.push(adminUser.id);

    // Create Driver User & Profile
    const driverUser = await prisma.user.create({
      data: {
        email: `driver-ws-${Date.now()}@test.bmsit.ac.in`,
        passwordHash: 'dummy_hash',
        role: Role.DRIVER,
        active: true,
      },
    });
    cleanupUserIds.push(driverUser.id);

    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        phone: `+9199887${Date.now().toString().slice(-5)}`,
        licenseNumber: `DL-WS-${Date.now().toString().slice(-6)}`,
        active: true,
      },
    });
    cleanupDriverIds.push(driver.id);

    // Create Student A (assigned to Route A)
    const studentUserA = await prisma.user.create({
      data: {
        email: `studentA-ws-${Date.now()}@test.bmsit.ac.in`,
        passwordHash: 'dummy_hash',
        role: Role.STUDENT,
        active: true,
      },
    });
    cleanupUserIds.push(studentUserA.id);

    const studentA = await prisma.student.create({
      data: {
        userId: studentUserA.id,
        usn: `1BY23CS${Date.now().toString().slice(-4)}`,
        phone: `+9188776${Date.now().toString().slice(-5)}`,
        active: true,
      },
    });
    cleanupStudentIds.push(studentA.id);

    // Stop on Route A for pickup assignment
    const routeStopA = await prisma.routeStop.findFirst({
      where: { routeId: routeA.id },
    });
    if (!routeStopA) throw new Error('No routeStop found for Route A');

    await prisma.pickupAssignment.create({
      data: {
        studentId: studentA.id,
        routeId: routeA.id,
        stopId: routeStopA.stopId,
        active: true,
      },
    });

    // Create Student B (assigned to Route B)
    const studentUserB = await prisma.user.create({
      data: {
        email: `studentB-ws-${Date.now()}@test.bmsit.ac.in`,
        passwordHash: 'dummy_hash',
        role: Role.STUDENT,
        active: true,
      },
    });
    cleanupUserIds.push(studentUserB.id);

    const studentB = await prisma.student.create({
      data: {
        userId: studentUserB.id,
        usn: `1BY23IS${Date.now().toString().slice(-4)}`,
        phone: `+9177665${Date.now().toString().slice(-5)}`,
        active: true,
      },
    });
    cleanupStudentIds.push(studentB.id);

    // Stop on Route B for pickup assignment
    const routeStopB = await prisma.routeStop.findFirst({
      where: { routeId: routeB.id },
    });
    if (!routeStopB) throw new Error('No routeStop found for Route B');

    await prisma.pickupAssignment.create({
      data: {
        studentId: studentB.id,
        routeId: routeB.id,
        stopId: routeStopB.stopId,
        active: true,
      },
    });

    // Create Buses
    const busA = await prisma.bus.create({
      data: {
        plateNumber: `WS-BUSA-${Date.now().toString().slice(-5)}`,
        capacity: 45,
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(busA.id);

    const busB = await prisma.bus.create({
      data: {
        plateNumber: `WS-BUSB-${Date.now().toString().slice(-5)}`,
        capacity: 45,
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(busB.id);

    // Create Trip A & Trip B
    const tripA = await prisma.trip.create({
      data: {
        busId: busA.id,
        driverId: driver.id,
        routeId: routeA.id,
        status: TripStatus.ACTIVE,
        startTime: new Date(),
      },
    });
    cleanupTripIds.push(tripA.id);

    const tripB = await prisma.trip.create({
      data: {
        busId: busB.id,
        driverId: driver.id,
        routeId: routeB.id,
        status: TripStatus.ACTIVE,
        startTime: new Date(),
      },
    });
    cleanupTripIds.push(tripB.id);

    // Mock JWT Service
    const mockJwtService = {
      verifyAsync: async (token: string) => {
        if (token === 'token-admin') return { sub: adminUser.id, role: 'ADMIN' };
        if (token === 'token-student-a') return { sub: studentUserA.id, role: 'STUDENT' };
        if (token === 'token-student-b') return { sub: studentUserB.id, role: 'STUDENT' };
        if (token === 'token-driver') return { sub: driverUser.id, role: 'DRIVER' };
        throw new Error('Invalid token');
      },
    } as any;

    const tripsGateway = new TripsGateway(mockJwtService, prisma);

    // Mock Socket Server Router with room isolation capture
    const roomDeliveries: Record<string, { event: string; payload: any }[]> = {};
    const globalDeliveries: { event: string; payload: any }[] = [];

    tripsGateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          roomDeliveries[room] = roomDeliveries[room] || [];
          roomDeliveries[room].push({ event, payload });
        },
      }),
      emit: (event: string, payload: any) => {
        globalDeliveries.push({ event, payload });
      },
    } as any;

    // Helper to create mock socket with room tracking
    const createMockClientSocket = (id: string, token: string) => {
      const rooms = new Set<string>();
      let disconnected = false;
      return {
        id,
        handshake: {
          auth: { token },
          headers: {},
          query: {},
        },
        data: {} as any,
        rooms,
        join: (room: string) => rooms.add(room),
        leave: (room: string) => rooms.delete(room),
        disconnect: () => {
          disconnected = true;
        },
        get isDisconnected() {
          return disconnected;
        },
      };
    };

    // =========================================================================
    // 1. TRIP CANCELLATION ISOLATION & GLOBAL LEAK PREVENTION
    // =========================================================================
    console.log('--- 1. Trip Cancellation Isolation (Zero Global Blast) ---');

    // Trigger trip cancellation for Trip A
    const cancelPayload = {
      tripId: tripA.id,
      status: 'CANCELLED',
      reason: 'Vehicle mechanical fault during transit',
      cancelledAt: new Date().toISOString(),
    };

    tripsGateway.broadcastTripCancelled(tripA.id, cancelPayload);

    const tripARoom = `trip:${tripA.id}`;
    const tripBRoom = `trip:${tripB.id}`;

    // Sockets in trip:TripA must receive event
    assert(
      roomDeliveries[tripARoom]?.some((d) => d.event === 'trip:cancelled'),
      'broadcastTripCancelled routes event to target trip room trip:TripA',
    );
    assert(
      roomDeliveries[tripARoom]?.[0]?.payload?.tripId === tripA.id,
      'Delivered cancellation payload identifies target Trip A',
    );

    // Fleet admin room must receive event
    assert(
      roomDeliveries['admin']?.some((d) => d.event === 'trip:cancelled'),
      'broadcastTripCancelled routes event to administrative room "admin"',
    );

    // Sockets in trip:TripB must NOT receive event
    assert(
      !roomDeliveries[tripBRoom]?.some((d) => d.event === 'trip:cancelled'),
      'broadcastTripCancelled does NOT leak to unrelated trip:TripB',
    );

    // Global broadcast must be exactly ZERO
    assert(
      globalDeliveries.length === 0,
      'Global this.server.emit is strictly eliminated (0 global emissions)',
    );

    // =========================================================================
    // 2. ZERO GLOBAL LEAKS ACROSS ALL TRIP-SCOPED TELEMETRY
    // =========================================================================
    console.log('\n--- 2. Telemetry Room Confinement & Zero Global Leaks ---');

    // Reset deliveries
    for (const key of Object.keys(roomDeliveries)) delete roomDeliveries[key];
    globalDeliveries.length = 0;

    // 2.1 broadcastLocation
    const mockLocation: TripLocationPayload = {
      tripId: tripA.id,
      latitude: 13.13324,
      longitude: 77.56815,
      speed: 35.5,
      heading: 90,
      accuracy: 5.0,
      recordedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };
    tripsGateway.broadcastLocation(tripA.id, mockLocation);
    assert(
      roomDeliveries[tripARoom]?.some((d) => d.event === TRIP_LOCATION),
      'trip:location delivered to trip:TripA',
    );
    assert(
      !roomDeliveries[tripBRoom]?.some((d) => d.event === TRIP_LOCATION),
      'trip:location not delivered to trip:TripB',
    );

    // 2.2 broadcastTripProgress
    const mockProgress: TripProgressPayload = {
      tripId: tripA.id,
      routeProgressPercentage: 45,
      status: 'AVAILABLE',
      delayStatus: 'ON_TIME',
      nextStopId: routeStopA.stopId,
      nextStopEtaMinutes: 5,
      deviation: false,
    };
    tripsGateway.broadcastTripProgress(tripA.id, mockProgress);
    assert(
      roomDeliveries[tripARoom]?.some((d) => d.event === TRIP_PROGRESS),
      'trip:progress delivered to trip:TripA',
    );
    assert(
      !roomDeliveries[tripBRoom]?.some((d) => d.event === TRIP_PROGRESS),
      'trip:progress not delivered to trip:TripB',
    );

    // 2.3 broadcastOccupancy
    const mockOccupancy: TripOccupancyPayload = {
      tripId: tripA.id,
      occupancyPercent: 40,
      occupancyStatus: 'SEATS_AVAILABLE',
      timestamp: new Date().toISOString(),
    };
    tripsGateway.broadcastOccupancy(tripA.id, mockOccupancy);
    assert(
      roomDeliveries[tripARoom]?.some((d) => d.event === TRIP_OCCUPANCY),
      'trip:occupancy delivered to trip:TripA',
    );
    assert(
      !roomDeliveries[tripBRoom]?.some((d) => d.event === TRIP_OCCUPANCY),
      'trip:occupancy not delivered to trip:TripB',
    );

    // 2.4 broadcastTripStarted
    const mockStarted: TripLifecyclePayload = {
      tripId: tripA.id,
      status: 'ACTIVE',
      timestamp: new Date().toISOString(),
    };
    tripsGateway.broadcastTripStarted(tripA.id, mockStarted);
    assert(
      roomDeliveries[tripARoom]?.some((d) => d.event === TRIP_STARTED),
      'trip:started delivered to trip:TripA',
    );

    // 2.5 broadcastTripCompleted
    const mockCompleted: TripLifecyclePayload = {
      tripId: tripA.id,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
    };
    tripsGateway.broadcastTripCompleted(tripA.id, mockCompleted);
    assert(
      roomDeliveries[tripARoom]?.some((d) => d.event === TRIP_COMPLETED),
      'trip:completed delivered to trip:TripA',
    );

    // Assert zero global leaks across all telemetry
    assert(
      globalDeliveries.length === 0,
      'Total global emissions remain strictly 0 across all telemetry broadcasts',
    );

    // =========================================================================
    // 3. ADMIN CHANNEL PROTECTION & ROOM MEMBERSHIP BOUNDARIES
    // =========================================================================
    console.log('\n--- 3. Administrative Room Protection ---');

    const studentSocketA = createMockClientSocket('sock-student-a', 'token-student-a');
    await tripsGateway.handleConnection(studentSocketA as any);

    // Non-admin socket must NOT automatically join 'admin' on connection
    assert(
      !studentSocketA.rooms.has('admin'),
      'Student socket connection does NOT auto-join "admin" room',
    );

    // Non-admin attempting to join 'admin' via admin:subscribe is rejected
    const adminSubResult = tripsGateway.handleAdminSubscribe(studentSocketA as any);
    assert(
      adminSubResult.event === 'error',
      'handleAdminSubscribe rejects student with error event',
    );
    assert(
      Boolean((adminSubResult as any).message?.includes('Forbidden') || (adminSubResult as any).message?.includes('Admin')),
      'Rejection message explicitly states Forbidden / Admin access required',
    );
    assert(
      !studentSocketA.rooms.has('admin'),
      'Student socket remains strictly excluded from "admin" room',
    );

    // Non-admin attempting to join 'admin' via trip subscription is rejected
    const tripSubAdminResult = await tripsGateway.handleSubscribe(studentSocketA as any, 'admin');
    assert(
      tripSubAdminResult.event === 'error',
      'handleSubscribe("admin") rejects non-admin student',
    );
    assert(
      !studentSocketA.rooms.has('admin') && !studentSocketA.rooms.has('trip:admin'),
      'Non-admin cannot bypass admin room boundary via trip subscription',
    );

    // Legitimate admin socket joins 'admin'
    const adminSocket = createMockClientSocket('sock-admin', 'token-admin');
    await tripsGateway.handleConnection(adminSocket as any);
    assert(
      adminSocket.rooms.has('admin'),
      'Admin socket automatically joins "admin" room upon authenticated connection',
    );

    // =========================================================================
    // 4. SUBSCRIPTION IDEMPOTENCY & FANOUT CLEANUP
    // =========================================================================
    console.log('\n--- 4. Subscription Idempotency & Fanout Guardrails ---');

    // 4.1 First subscription to Trip A
    const firstSub = await tripsGateway.handleSubscribe(studentSocketA as any, tripA.id);
    assert(
      firstSub.event === 'subscribed' && firstSub.room === tripARoom,
      'First trip subscription joins room trip:TripA',
    );
    assert(studentSocketA.rooms.has(tripARoom), 'Socket rooms set contains trip:TripA');

    // 4.2 Repeated subscription to Trip A from same socket is idempotent
    const secondSub = await tripsGateway.handleSubscribe(studentSocketA as any, tripA.id);
    assert(
      secondSub.event === 'subscribed',
      'Repeated trip subscription succeeds without error',
    );
    assert(
      (secondSub as any).idempotent === true,
      'Repeated trip subscription returns idempotent: true flag',
    );

    // 4.3 Repeated admin subscribe is idempotent
    const secondAdminSub = tripsGateway.handleAdminSubscribe(adminSocket as any);
    assert(
      (secondAdminSub as any).idempotent === true,
      'Repeated admin:subscribe returns idempotent: true flag without duplicating membership',
    );

    // =========================================================================
    // 5. STUDENT ROUTE ACCESS AUTHORIZATION BOUNDARY
    // =========================================================================
    console.log('\n--- 5. Student Route Access Authorization Boundary ---');

    // Student B (on Route B) attempts to subscribe to Trip A (on Route A)
    const studentSocketB = createMockClientSocket('sock-student-b', 'token-student-b');
    await tripsGateway.handleConnection(studentSocketB as any);

    const unauthorizedSub = await tripsGateway.handleSubscribe(studentSocketB as any, tripA.id);
    assert(
      unauthorizedSub.event === 'error',
      'Student assigned to Route B cannot subscribe to Trip A (on Route A)',
    );
    assert(
      Boolean((unauthorizedSub as any).message?.includes('Forbidden') || (unauthorizedSub as any).message?.includes('Unauthorized')),
      'Unauthorized subscription rejected with Forbidden error message',
    );
    assert(
      !studentSocketB.rooms.has(tripARoom),
      'Unauthorized socket is NOT joined to trip:TripA room',
    );
  } finally {
    // Clean up created test entities
    for (const tripId of cleanupTripIds) {
      await prisma.boardingEvent.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.tripAudit.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    }

    for (const studentId of cleanupStudentIds) {
      await prisma.pickupAssignment.deleteMany({ where: { studentId } }).catch(() => {});
      await prisma.boardingEvent.deleteMany({ where: { studentId } }).catch(() => {});
      await prisma.student.delete({ where: { id: studentId } }).catch(() => {});
    }

    for (const driverId of cleanupDriverIds) {
      await prisma.driver.delete({ where: { id: driverId } }).catch(() => {});
    }

    for (const userId of cleanupUserIds) {
      await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }

    for (const busId of cleanupBusIds) {
      await prisma.bus.delete({ where: { id: busId } }).catch(() => {});
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

runWebsocketIsolationFanoutSuite().catch((err) => {
  console.error('Fatal test execution failure:', err);
  process.exit(1);
});
