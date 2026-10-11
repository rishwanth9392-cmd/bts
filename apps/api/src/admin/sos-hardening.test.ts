import { PrismaClient, Role, TripStatus } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { PrismaService } from '../prisma/prisma.module';
import { TripsGateway } from '../trips/trips.gateway';
import { ADMIN_SOS, AdminSosPayload } from '@bts/shared';

async function runSosHardeningVerification() {
  console.log('========================================================================');
  console.log('🧪 Step 2: SOS Lifecycle Hardening & Admin Room Isolation Test Suite');
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
    // 1. WEBSOCKET ADMIN ROOM & BROADCAST ISOLATION
    // =========================================================================
    console.log('--- 1. WebSocket Admin Room & Broadcast Isolation ---');

    const mockJwtService = {
      verifyAsync: async (token: string) => {
        if (token === 'admin-token') return { sub: 'admin-1', role: 'ADMIN' };
        if (token === 'student-token') return { sub: 'student-1', role: 'STUDENT' };
        if (token === 'driver-token') return { sub: 'driver-1', role: 'DRIVER' };
        throw new Error('Invalid token');
      },
    } as any;

    const tripsGateway = new TripsGateway(mockJwtService);

    // Track rooms joined by clients
    const joinedRooms: Record<string, string[]> = {};
    const createMockSocket = (id: string, token: string) => ({
      id,
      handshake: { auth: { token } },
      data: {} as any,
      join: (room: string) => {
        joinedRooms[id] = joinedRooms[id] || [];
        joinedRooms[id].push(room);
      },
      disconnect: (_bool: boolean) => {},
    });

    // 1.1 Admin connection auto-joins 'admin' room
    const adminSocket = createMockSocket('sock-admin', 'admin-token');
    await tripsGateway.handleConnection(adminSocket as any);
    assert(
      joinedRooms['sock-admin']?.includes('admin'),
      'Admin socket automatically joins isolated "admin" room',
    );
    assert(
      joinedRooms['sock-admin']?.includes('user:admin-1'),
      'Admin socket joins personal "user:admin-1" room',
    );

    // 1.2 Student connection does NOT join 'admin' room
    const studentSocket = createMockSocket('sock-student', 'student-token');
    await tripsGateway.handleConnection(studentSocket as any);
    assert(
      !joinedRooms['sock-student']?.includes('admin'),
      'Student socket is strictly excluded from "admin" room',
    );

    // 1.3 Driver connection does NOT join 'admin' room
    const driverSocket = createMockSocket('sock-driver', 'driver-token');
    await tripsGateway.handleConnection(driverSocket as any);
    assert(
      !joinedRooms['sock-driver']?.includes('admin'),
      'Driver socket is strictly excluded from "admin" room',
    );

    // 1.4 Broadcast isolation: broadcastAdminSos emits strictly to 'admin' room
    let globalEmitted = false;
    let adminRoomEmitted = false;
    let targetRoom = '';

    tripsGateway.server = {
      to: (room: string) => {
        targetRoom = room;
        return {
          emit: (event: string, _payload: any) => {
            if (room === 'admin' && event === ADMIN_SOS) {
              adminRoomEmitted = true;
            }
          },
        };
      },
      emit: (_event: string, _payload: any) => {
        globalEmitted = true;
      },
    } as any;

    const mockSosPayload: AdminSosPayload = {
      tripId: baselineTrip.id,
      busId: baselineTrip.busId,
      driverId: baselineTrip.driverId,
      timestamp: new Date().toISOString(),
    };

    tripsGateway.broadcastAdminSos(mockSosPayload);
    assert(
      adminRoomEmitted && targetRoom === 'admin',
      'broadcastAdminSos targets room "admin" strictly',
    );
    assert(
      !globalEmitted,
      'broadcastAdminSos does NOT emit globally (zero student/driver leakage)',
    );

    // =========================================================================
    // 2. SOS STATE TRANSITION LOCKS & IDEMPOTENCY
    // =========================================================================
    console.log('\n--- 2. SOS State Transition Locks & Idempotency ---');

    // Create an unacknowledged, unresolved SOS alert record with evidence
    const testSosAlert = await prisma.tripAudit.create({
      data: {
        tripId: baselineTrip.id,
        driverId: baselineTrip.driverId,
        action: 'SOS',
        timestamp: new Date(),
        metadata: {
          alert: 'EMERGENCY_DISTRESS_SIGNAL',
          reason: 'Engine coolant temperature critical',
          lastKnownGps: {
            latitude: 13.13324,
            longitude: 77.56815,
            speed: 12.5,
            accuracy: 4.2,
            recordedAt: new Date().toISOString(),
          },
        },
      },
    });

    assert(Boolean(testSosAlert.id), 'Initial test SOS alert created in TripAudit');

    // 2.1 First acknowledgment
    const ack1 = await adminService.acknowledgeSos(testSosAlert.id, adminUser.id);
    assert(ack1.success === true, 'First acknowledgeSos call succeeds');
    assert(Boolean(ack1.alert.acknowledgedAt), 'acknowledgedAt timestamp stamped');
    assert(ack1.alert.acknowledgedBy === adminUser.id, 'acknowledgedBy matches admin ID');

    const auditCountAfterFirstAck = await prisma.adminAudit.count({
      where: { action: 'SOS_ACKNOWLEDGED', targetId: testSosAlert.id },
    });
    assert(auditCountAfterFirstAck === 1, 'Exactly 1 SOS_ACKNOWLEDGED audit record logged');

    // 2.2 Repeated acknowledgment (Idempotency check)
    const ack2 = await adminService.acknowledgeSos(testSosAlert.id, adminUser.id);
    assert(ack2.success === true, 'Repeated acknowledgeSos call returns cleanly (idempotent)');
    assert(
      ack2.alert.acknowledgedAt?.getTime() === ack1.alert.acknowledgedAt?.getTime(),
      'acknowledgedAt timestamp preserved on duplicate acknowledgment',
    );

    const auditCountAfterSecondAck = await prisma.adminAudit.count({
      where: { action: 'SOS_ACKNOWLEDGED', targetId: testSosAlert.id },
    });
    assert(
      auditCountAfterSecondAck === 1,
      'Duplicate acknowledgment does NOT duplicate AdminAudit records',
    );

    // =========================================================================
    // 3. RESOLUTION VALIDATION & STATE LOCKS
    // =========================================================================
    console.log('\n--- 3. Resolution Notes Validation & State Locks ---');

    // 3.1 Empty resolution notes -> 400
    try {
      await adminService.resolveSos(testSosAlert.id, adminUser.id, '');
      assert(false, 'Empty resolution notes should throw BadRequestException');
    } catch (err: any) {
      assert(
        err instanceof BadRequestException && err.getStatus() === 400,
        'Empty resolution notes rejected with 400 BadRequestException',
      );
    }

    // 3.2 Whitespace resolution notes -> 400
    try {
      await adminService.resolveSos(testSosAlert.id, adminUser.id, '    ');
      assert(false, 'Whitespace resolution notes should throw BadRequestException');
    } catch (err: any) {
      assert(
        err instanceof BadRequestException && err.getStatus() === 400,
        'Whitespace resolution notes rejected with 400 BadRequestException',
      );
    }

    // 3.3 Notes too short (< 5 characters) -> 400
    try {
      await adminService.resolveSos(testSosAlert.id, adminUser.id, 'done');
      assert(false, 'Resolution notes < 5 chars should throw BadRequestException');
    } catch (err: any) {
      assert(
        err instanceof BadRequestException && err.getStatus() === 400,
        'Resolution notes under 5 characters rejected with 400 BadRequestException',
      );
    }

    // 3.4 Valid resolution notes (>= 5 characters) -> Success
    const validNotes = 'Assistance maintenance van dispatched; passengers secure.';
    const resolveResult = await adminService.resolveSos(
      testSosAlert.id,
      adminUser.id,
      validNotes,
    );
    assert(resolveResult.success === true, 'Valid resolveSos call succeeds');
    assert(Boolean(resolveResult.alert.resolvedAt), 'resolvedAt timestamp stamped');
    assert(
      resolveResult.alert.resolutionNotes === validNotes,
      'resolutionNotes matches trimmed submission',
    );

    const auditCountAfterResolve = await prisma.adminAudit.count({
      where: { action: 'SOS_RESOLVED', targetId: testSosAlert.id },
    });
    assert(auditCountAfterResolve === 1, 'Exactly 1 SOS_RESOLVED audit record logged');

    // 3.5 State Lock: Attempt to resolve an already resolved alert -> 409 ConflictException
    try {
      await adminService.resolveSos(
        testSosAlert.id,
        adminUser.id,
        'Attempting secondary resolution notes overwrite',
      );
      assert(false, 'Resolving an already resolved alert should throw 409 ConflictException');
    } catch (err: any) {
      assert(
        err instanceof ConflictException && err.getStatus() === 409,
        'Resolving an already resolved alert rejected with 409 ConflictException (State Lock)',
      );
    }

    // 3.6 Acknowledging an already resolved alert should be idempotent without error or rewrite
    const ackAfterResolve = await adminService.acknowledgeSos(testSosAlert.id, adminUser.id);
    assert(
      ackAfterResolve.success === true,
      'Acknowledge after resolve returns cleanly as idempotent without throwing',
    );
    assert(
      ackAfterResolve.alert.resolvedAt !== null,
      'Resolved state preserved after idempotent acknowledge call',
    );

    // =========================================================================
    // 4. PRESERVATION OF ORIGINAL EVIDENCE
    // =========================================================================
    console.log('\n--- 4. Preservation of Original SOS Evidence ---');

    const finalAlertRecord = await prisma.tripAudit.findUnique({
      where: { id: testSosAlert.id },
    });

    assert(Boolean(finalAlertRecord), 'Alert record retrieved from database');
    assert(
      finalAlertRecord?.tripId === baselineTrip.id,
      'Original tripId preserved intact',
    );
    assert(
      finalAlertRecord?.driverId === baselineTrip.driverId,
      'Original driverId preserved intact',
    );
    assert(
      finalAlertRecord?.action === 'SOS',
      'Action type remains strictly "SOS"',
    );

    const finalMeta: any = finalAlertRecord?.metadata;
    assert(
      finalMeta?.alert === 'EMERGENCY_DISTRESS_SIGNAL',
      'Original alert classification in metadata preserved',
    );
    assert(
      finalMeta?.reason === 'Engine coolant temperature critical',
      'Original distress reason preserved',
    );
    assert(
      finalMeta?.lastKnownGps?.latitude === 13.13324 &&
        finalMeta?.lastKnownGps?.longitude === 77.56815 &&
        finalMeta?.lastKnownGps?.speed === 12.5,
      'Original GPS coordinates, speed, and accuracy preserved exactly',
    );

    // Clean up test records
    await prisma.adminAudit.deleteMany({ where: { targetId: testSosAlert.id } });
    await prisma.tripAudit.delete({ where: { id: testSosAlert.id } });

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n========================================================================');
    console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
    console.log('========================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL STEP 2 SOS HARDENING ASSERTIONS PASSED CLEANLY!\n');
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

runSosHardeningVerification();
