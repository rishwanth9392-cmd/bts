import { PrismaClient, Role, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { TripsGateway } from './trips.gateway';
import { TripsService } from './trips.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GeofenceService } from './geofence.service';
import { RouteProgressService } from './route-progress.service';
import {
  PICKUP_ARRIVED,
  NOTIFICATION_NEW,
  TRIP_LOCATION,
  TRIP_PROGRESS,
  TRIP_OCCUPANCY,
  PickupArrivedPayload,
  TripLocationPayload,
  TripProgressPayload,
  TripOccupancyPayload,
} from '@bts/shared';

async function runNotificationIsolationVerification() {
  console.log('========================================================================');
  console.log('🧪 Step 3: Notification Reliability & Realtime Room Isolation Test Suite');
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

  try {
    // -------------------------------------------------------------------------
    // Setup & Fixtures
    // -------------------------------------------------------------------------
    const adminUser = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });
    if (!adminUser) {
      throw new Error('Precondition failed: No admin user in database.');
    }

    const baselineTrip = await prisma.trip.findFirst({
      where: { status: TripStatus.ACTIVE },
      include: { driver: { include: { user: true } }, bus: true, route: true },
    });
    if (!baselineTrip) {
      throw new Error('Precondition failed: No active trip in database.');
    }

    // Find student assigned to this trip's route
    let assignedStudent = await prisma.student.findFirst({
      where: {
        pickupAssignment: {
          routeId: baselineTrip.routeId,
          active: true,
        },
      },
      include: { user: true, pickupAssignment: true },
    });

    // If none exists, find or create one for test
    if (!assignedStudent) {
      const anyStudent = await prisma.student.findFirst({
        include: { user: true, pickupAssignment: true },
      });
      if (!anyStudent) {
        throw new Error('Precondition failed: No students found in database.');
      }
      assignedStudent = anyStudent;
    }

    // Mock JWT Service for authentication
    const mockJwtService = {
      verifyAsync: async (token: string) => {
        if (token === 'token-admin') return { sub: adminUser.id, role: 'ADMIN' };
        if (token === 'token-student-a') return { sub: assignedStudent.user.id, role: 'STUDENT' };
        if (token === 'token-student-b') return { sub: 'mock-student-b-id', role: 'STUDENT' };
        if (token === 'token-driver-assigned') {
          return { sub: baselineTrip.driver.userId, role: 'DRIVER' };
        }
        if (token === 'token-driver-unassigned') {
          return { sub: 'mock-unassigned-driver-id', role: 'DRIVER' };
        }
        throw new Error('Invalid or expired token');
      },
    } as any;

    const tripsGateway = new TripsGateway(mockJwtService, prisma);
    const geofenceService = new GeofenceService(
      prisma,
      tripsGateway,
      new NotificationsService(prisma, tripsGateway),
    );
    const routeProgressService = new RouteProgressService(prisma, geofenceService, tripsGateway);
    const tripsService = new TripsService(
      prisma,
      tripsGateway,
      geofenceService,
      routeProgressService,
    );
    const notificationsService = new NotificationsService(prisma, tripsGateway);

    // Mock client socket factory
    const createMockSocket = (id: string, token?: string) => {
      let disconnected = false;
      const joined: string[] = [];
      const left: string[] = [];
      return {
        id,
        handshake: {
          auth: token ? { token } : {},
          headers: {},
          query: {},
        },
        data: {} as any,
        join: (room: string) => {
          if (!joined.includes(room)) joined.push(room);
        },
        leave: (room: string) => {
          left.push(room);
          const idx = joined.indexOf(room);
          if (idx !== -1) joined.splice(idx, 1);
        },
        disconnect: (_close = true) => {
          disconnected = true;
        },
        get isDisconnected() {
          return disconnected;
        },
        get joinedRooms() {
          return [...joined];
        },
        get leftRooms() {
          return [...left];
        },
      };
    };

    // =========================================================================
    // 1. UNAUTHENTICATED CONNECTION REJECTION
    // =========================================================================
    console.log('--- 1. Unauthenticated & Invalid Handshake Rejection ---');

    // 1.1 Connection with missing token is rejected
    const unauthSocketMissingToken = createMockSocket('sock-missing-token');
    await tripsGateway.handleConnection(unauthSocketMissingToken as any);
    assert(
      unauthSocketMissingToken.isDisconnected,
      'Socket with missing JWT token is immediately disconnected',
    );
    assert(
      unauthSocketMissingToken.joinedRooms.length === 0,
      'Disconnected socket joins zero rooms',
    );

    // 1.2 Connection with invalid / malformed token is rejected
    const unauthSocketBadToken = createMockSocket('sock-bad-token', 'malformed.garbage.token');
    await tripsGateway.handleConnection(unauthSocketBadToken as any);
    assert(
      unauthSocketBadToken.isDisconnected,
      'Socket with invalid/unverifiable JWT is immediately disconnected',
    );
    assert(
      unauthSocketBadToken.joinedRooms.length === 0,
      'Unverifiable socket joins zero rooms',
    );

    // 1.3 Valid token connection succeeds and auto-joins personal room
    const validStudentSocket = createMockSocket('sock-student-a', 'token-student-a');
    await tripsGateway.handleConnection(validStudentSocket as any);
    assert(
      !validStudentSocket.isDisconnected,
      'Valid student token successfully authenticates',
    );
    assert(
      validStudentSocket.joinedRooms.includes(`user:${assignedStudent.user.id}`),
      `Authenticated socket automatically joins personal room "user:${assignedStudent.user.id}"`,
    );
    assert(
      !validStudentSocket.joinedRooms.includes('admin'),
      'Student socket is strictly excluded from "admin" room on connection',
    );

    // =========================================================================
    // 2. ROOM SPOOFING REJECTION & SUBSCRIPTION AUTHORIZATION
    // =========================================================================
    console.log('\n--- 2. Room Spoofing Rejection & Subscription Authorization ---');

    // 2.1 Student A attempts to spoof and join Student B's private room via object payload
    const spoofAttemptObj = tripsGateway.handleUserSubscribe(validStudentSocket as any, {
      userId: 'mock-student-b-id',
    });
    assert(
      spoofAttemptObj?.event === 'error',
      'Spoof attempt with arbitrary userId object payload returns error event',
    );
    assert(
      !validStudentSocket.joinedRooms.includes('user:mock-student-b-id'),
      'Socket A is strictly prevented from joining "user:mock-student-b-id"',
    );

    // 2.2 Student A attempts to spoof via string payload
    const spoofAttemptStr = tripsGateway.handleUserSubscribe(
      validStudentSocket as any,
      'mock-student-b-id',
    );
    assert(
      spoofAttemptStr?.event === 'error',
      'Spoof attempt with arbitrary userId string payload returns error event',
    );
    assert(
      !validStudentSocket.joinedRooms.includes('user:mock-student-b-id'),
      'Socket A cannot spoof private room using string parameter',
    );

    // 2.3 Student A confirms self subscription (idempotent / authorized)
    const selfSubResult = tripsGateway.handleUserSubscribe(validStudentSocket as any, {
      userId: assignedStudent.user.id,
    });
    assert(
      selfSubResult?.event === 'subscribed' &&
        selfSubResult?.room === `user:${assignedStudent.user.id}`,
      'Legitimate subscription to own personal room succeeds',
    );

    // 2.4 Student A attempts to unsubscribe another user's room
    const spoofUnsub = tripsGateway.handleUserUnsubscribe(validStudentSocket as any, {
      userId: 'mock-student-b-id',
    });
    assert(
      spoofUnsub?.event === 'error',
      'Attempt to unsubscribe another user\'s private room is rejected',
    );

    // 2.5 Trip Room Access Authorization:
    // 2.5a Student assigned to route subscribes to active trip -> Allowed
    const assignedTripSub = await tripsGateway.handleSubscribe(validStudentSocket as any, {
      tripId: baselineTrip.id,
    });
    assert(
      assignedTripSub?.event === 'subscribed' &&
        assignedTripSub?.room === `trip:${baselineTrip.id}`,
      'Student assigned to trip route is permitted to subscribe to trip room',
    );

    // 2.5b Student on different route attempts to subscribe -> Denied (403)
    const studentBSocket = createMockSocket('sock-student-b', 'token-student-b');
    await tripsGateway.handleConnection(studentBSocket as any);
    const unauthorizedTripSub = await tripsGateway.handleSubscribe(studentBSocket as any, {
      tripId: baselineTrip.id,
    });
    assert(
      Boolean(
        unauthorizedTripSub?.event === 'error' &&
          unauthorizedTripSub?.message?.includes('Forbidden'),
      ),
      'Unassigned student is denied subscription to unassigned trip room',
    );
    assert(
      !studentBSocket.joinedRooms.includes(`trip:${baselineTrip.id}`),
      'Unassigned student socket did NOT join trip room',
    );

    // 2.5c Assigned Driver subscribes to trip -> Allowed
    const assignedDriverSocket = createMockSocket('sock-driver-assigned', 'token-driver-assigned');
    await tripsGateway.handleConnection(assignedDriverSocket as any);
    const driverTripSub = await tripsGateway.handleSubscribe(assignedDriverSocket as any, {
      tripId: baselineTrip.id,
    });
    assert(
      driverTripSub?.event === 'subscribed',
      'Assigned driver is permitted to subscribe to their active trip room',
    );

    // 2.5d Unassigned Driver attempts to subscribe -> Denied
    const unassignedDriverSocket = createMockSocket('sock-driver-unassigned', 'token-driver-unassigned');
    await tripsGateway.handleConnection(unassignedDriverSocket as any);
    const unassignedDriverTripSub = await tripsGateway.handleSubscribe(unassignedDriverSocket as any, {
      tripId: baselineTrip.id,
    });
    assert(
      unassignedDriverTripSub?.event === 'error',
      'Unassigned driver is denied access to unauthorized trip room',
    );

    // 2.5e Admin subscribes to trip -> Allowed
    const adminSocket = createMockSocket('sock-admin', 'token-admin');
    await tripsGateway.handleConnection(adminSocket as any);
    const adminTripSub = await tripsGateway.handleSubscribe(adminSocket as any, {
      tripId: baselineTrip.id,
    });
    assert(
      adminTripSub?.event === 'subscribed',
      'Admin is permitted to monitor any trip room',
    );

    // =========================================================================
    // 3. PRIVATE NOTIFICATION ROUTING & DATA ISOLATION
    // =========================================================================
    console.log('\n--- 3. Private Notification Routing & Data Isolation ---');

    // Setup mock server router to record room deliveries
    const receivedDeliveries: Record<string, { event: string; payload: any }[]> = {};

    tripsGateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          receivedDeliveries[room] = receivedDeliveries[room] || [];
          receivedDeliveries[room].push({ event, payload });
        },
      }),
      emit: (event: string, payload: any) => {
        receivedDeliveries['*GLOBAL*'] = receivedDeliveries['*GLOBAL*'] || [];
        receivedDeliveries['*GLOBAL*'].push({ event, payload });
      },
    } as any;

    const targetUserRoom = `user:${assignedStudent.user.id}`;
    const studentBRoom = 'user:mock-student-b-id';
    const driverRoom = `user:${baselineTrip.driver.userId}`;

    // 3.1 emitPickupArrived strictly to targeted student
    const mockPickupPayload: PickupArrivedPayload = {
      tripId: baselineTrip.id,
      routeId: baselineTrip.routeId,
      stopId: 'stop-1',
      stopName: 'BMSIT Main Gate',
      distanceMeters: 28,
      occurredAt: new Date().toISOString(),
    };
    tripsGateway.emitPickupArrived(assignedStudent.user.id, mockPickupPayload);

    assert(
      receivedDeliveries[targetUserRoom]?.some((d) => d.event === PICKUP_ARRIVED),
      `pickup:arrived delivered strictly to ${targetUserRoom}`,
    );
    assert(
      !receivedDeliveries[studentBRoom]?.some((d) => d.event === PICKUP_ARRIVED),
      'pickup:arrived is completely invisible to Student B',
    );
    assert(
      !receivedDeliveries[driverRoom]?.some((d) => d.event === PICKUP_ARRIVED),
      'pickup:arrived is completely invisible to Driver',
    );
    assert(
      !receivedDeliveries['*GLOBAL*']?.some((d) => d.event === PICKUP_ARRIVED),
      'pickup:arrived has zero global broadcast leakage',
    );

    // 3.2 emitNewNotification strictly to targeted student
    const mockNotificationPayload = {
      id: 'notif-123',
      title: 'Bus Approaching',
      message: 'Bus arriving in 2 minutes',
    };
    tripsGateway.emitNewNotification(assignedStudent.user.id, mockNotificationPayload);

    assert(
      receivedDeliveries[targetUserRoom]?.some((d) => d.event === NOTIFICATION_NEW),
      `notification:new delivered strictly to ${targetUserRoom}`,
    );
    assert(
      !receivedDeliveries[studentBRoom]?.some((d) => d.event === NOTIFICATION_NEW),
      'notification:new is completely invisible to Student B',
    );
    assert(
      !receivedDeliveries[driverRoom]?.some((d) => d.event === NOTIFICATION_NEW),
      'notification:new is completely invisible to Driver',
    );

    // 3.3 emitBoardingConfirmed strictly to targeted student
    tripsGateway.emitBoardingConfirmed(assignedStudent.user.id, {
      tripId: baselineTrip.id,
      stopId: 'stop-1',
      timestamp: new Date().toISOString(),
    });
    assert(
      receivedDeliveries[targetUserRoom]?.some((d) => d.event === 'boarding:confirmed'),
      `boarding:confirmed delivered strictly to ${targetUserRoom}`,
    );
    assert(
      !receivedDeliveries[studentBRoom]?.some((d) => d.event === 'boarding:confirmed'),
      'boarding:confirmed is invisible to Student B',
    );

    // 3.4 emitDropoffConfirmed strictly to targeted student
    tripsGateway.emitDropoffConfirmed(assignedStudent.user.id, {
      tripId: baselineTrip.id,
      stopId: 'stop-1',
      timestamp: new Date().toISOString(),
    });
    assert(
      receivedDeliveries[targetUserRoom]?.some((d) => d.event === 'dropoff:confirmed'),
      `dropoff:confirmed delivered strictly to ${targetUserRoom}`,
    );
    assert(
      !receivedDeliveries[studentBRoom]?.some((d) => d.event === 'dropoff:confirmed'),
      'dropoff:confirmed is invisible to Student B',
    );

    // 3.5 End-to-end NotificationsService persistence and WebSocket dispatch
    const createdNotif = await notificationsService.create(
      assignedStudent.user.id,
      'BUS_NEAR_PICKUP',
      'Arrival Warning',
      'Your bus is 50 meters away.',
      { stopId: 'stop-1' },
    );
    assert(Boolean(createdNotif.id), 'In-app notification saved to database');
    assert(
      receivedDeliveries[targetUserRoom]?.some(
        (d) => d.event === NOTIFICATION_NEW && d.payload.id === createdNotif.id,
      ),
      'In-app notification automatically dispatched over WebSocket strictly to student room',
    );

    // Clean up created test notification
    await prisma.notification.delete({ where: { id: createdNotif.id } });

    // =========================================================================
    // 4. BROADCAST SANITIZATION & DATA MINIMIZATION
    // =========================================================================
    console.log('\n--- 4. Broadcast Sanitization & Data Minimization ---');

    // 4.1 Trip Location broadcast sanitization
    const mockLocation: TripLocationPayload = {
      tripId: baselineTrip.id,
      latitude: 13.13324,
      longitude: 77.56815,
      speed: 34.2,
      heading: 180,
      accuracy: 4.5,
      recordedAt: new Date().toISOString(),
      status: 'ACTIVE',
    };
    tripsGateway.broadcastLocation(baselineTrip.id, mockLocation);

    const tripRoom = `trip:${baselineTrip.id}`;
    const deliveredLoc = receivedDeliveries[tripRoom]?.find(
      (d) => d.event === TRIP_LOCATION,
    );
    assert(Boolean(deliveredLoc), 'trip:location broadcasted to trip room');
    assert(
      !('studentId' in deliveredLoc!.payload) &&
        !('studentName' in deliveredLoc!.payload) &&
        !('boardings' in deliveredLoc!.payload) &&
        !('passengers' in deliveredLoc!.payload),
      'trip:location contains zero student PII or passenger identifiers',
    );

    // 4.2 Trip Progress broadcast sanitization
    const mockProgress: TripProgressPayload = {
      tripId: baselineTrip.id,
      routeProgressPercentage: 62.5,
      status: 'AVAILABLE',
      delayStatus: 'ON_TIME',
      nextStopId: 'stop-2',
      nextStopEtaMinutes: 4,
      deviation: false,
    };
    tripsGateway.broadcastTripProgress(baselineTrip.id, mockProgress);

    const deliveredProgress = receivedDeliveries[tripRoom]?.find(
      (d) => d.event === TRIP_PROGRESS,
    );
    assert(Boolean(deliveredProgress), 'trip:progress broadcasted to trip room');
    assert(
      !('studentId' in deliveredProgress!.payload) &&
        !('studentName' in deliveredProgress!.payload) &&
        !('headcount' in deliveredProgress!.payload),
      'trip:progress contains anonymized stop sequence only (zero student PII)',
    );

    // 4.3 Trip Occupancy broadcast sanitization
    const mockOccupancy: TripOccupancyPayload = {
      tripId: baselineTrip.id,
      occupiedSeats: 24,
      capacity: 50,
      occupancyPercentage: 48,
      occupancyPercent: 48,
      occupancyStatus: 'SEATS_AVAILABLE',
      timestamp: new Date().toISOString(),
    };
    tripsGateway.broadcastOccupancy(baselineTrip.id, mockOccupancy);

    const deliveredOccupancy = receivedDeliveries[tripRoom]?.find(
      (d) => d.event === TRIP_OCCUPANCY,
    );
    assert(Boolean(deliveredOccupancy), 'trip:occupancy broadcasted to trip room');
    assert(
      !('students' in deliveredOccupancy!.payload) &&
        !('boardedStudents' in deliveredOccupancy!.payload),
      'trip:occupancy emits aggregated seat count / percentage without student rosters',
    );

    // =========================================================================
    // 5. RECONNECTION RECOVERY GUARANTEES
    // =========================================================================
    console.log('\n--- 5. Reconnection Recovery Endpoints ---');

    // 5.1 Authoritative notifications retrieval
    const studentNotifs = await notificationsService.getUserNotifications(
      assignedStudent.user.id,
      10,
    );
    assert(
      Array.isArray(studentNotifs),
      'GET /notifications returns authoritative notification history array',
    );
    assert(
      studentNotifs.every((n) => n.userId === assignedStudent.user.id),
      'All returned notifications strictly belong to authenticated student',
    );

    // 5.2 Active trip recovery via GET /trips/:id
    const tripDetails = await tripsService.getTripById(baselineTrip.id);
    assert(Boolean(tripDetails.id), 'GET /trips/:id successfully recovers trip state');
    assert(
      typeof tripDetails.currentOccupancy === 'number',
      'GET /trips/:id includes calculated net occupancy',
    );
    assert(
      typeof tripDetails.occupancyPercentage === 'number',
      'GET /trips/:id includes calculated occupancy percentage',
    );
    assert(
      !('boardings' in tripDetails),
      'GET /trips/:id strips raw boardings array to preserve student privacy',
    );

    // 5.3 Active trips recovery via GET /trips/active
    const activeTrips = await tripsService.getActiveTrips({
      id: assignedStudent.user.id,
      role: 'STUDENT',
    });
    assert(
      Array.isArray(activeTrips) && activeTrips.length > 0,
      'GET /trips/active successfully returns active trips for reconnecting students',
    );

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n========================================================================');
    console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
    console.log('========================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL NOTIFICATION ISOLATION ASSERTIONS PASSED CLEANLY!\n');
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

runNotificationIsolationVerification();
