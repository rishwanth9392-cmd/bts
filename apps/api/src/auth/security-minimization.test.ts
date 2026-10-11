import { PrismaClient, BusStatus, TripStatus, BoardingEventType, BoardingMethod, Role } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { DriverService } from '../driver/driver.service';
import { TripsService } from '../trips/trips.service';
import { TripsGateway } from '../trips/trips.gateway';
import { getJwtSecret, FALLBACK_DEV_SECRET, FATAL_JWT_SECRET_ERROR } from './jwt-secret.helper';
import type { TripOccupancyPayload } from '@bts/shared';

async function runSecurityMinimizationSuite() {
  console.log('========================================================================');
  console.log('🛡️ Step 3: Security & Data Minimization Hardening Verification Suite');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;
  const jwtService = new JwtService({ secret: 'test_jwt_secret_token_key' });
  const authService = new AuthService(prisma, jwtService);
  const driverService = new DriverService(prisma);

  let capturedOccupancyPayload: TripOccupancyPayload | null = null;
  const mockTripsGateway = {
    broadcastOccupancy: (_tripId: string, payload: TripOccupancyPayload) => {
      capturedOccupancyPayload = payload;
    },
    broadcastTripStarted: () => {},
    broadcastTripEnded: () => {},
    emitStudentEta: () => {},
    broadcastTripProgress: () => {},
  } as unknown as TripsGateway;

  const tripsService = new TripsService(
    prisma,
    mockTripsGateway,
    {} as any,
    {} as any,
  );

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

  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  try {
    // =========================================================================
    // 1. DATA MINIMIZATION IN DRIVER TRIP VIEWS
    // =========================================================================
    console.log('--- 1. Data Minimization in Driver Trip Views (DriverService.getCurrentTrip) ---');

    // 1.1 Create test user & driver
    const driverUser = await prisma.user.create({
      data: {
        email: `driver-sec-${Date.now()}@test.bmsit.ac.in`,
        passwordHash: 'dummy_hash',
        role: Role.DRIVER,
        active: true,
      },
    });
    cleanupUserIds.push(driverUser.id);

    const driverPhone = `+9199999${Date.now().toString().slice(-5)}`;
    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        phone: driverPhone,
        licenseNumber: `DL-SEC-${Date.now().toString().slice(-6)}`,
        active: true,
      },
    });
    cleanupDriverIds.push(driver.id);

    // 1.2 Create test student
    const studentUser = await prisma.user.create({
      data: {
        email: `student-sec-${Date.now()}@test.bmsit.ac.in`,
        passwordHash: 'dummy_hash',
        role: Role.STUDENT,
        active: true,
      },
    });
    cleanupUserIds.push(studentUser.id);

    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        usn: `1BY23CS${Date.now().toString().slice(-4)}`,
        phone: `+9188888${Date.now().toString().slice(-5)}`,
        active: true,
      },
    });
    cleanupStudentIds.push(student.id);

    // 1.3 Create test bus & route
    const testBus = await prisma.bus.create({
      data: {
        plateNumber: `SEC-BUS-${Date.now().toString().slice(-5)}`,
        capacity: 50,
        model: 'Tata Marcopolo Security Test',
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    cleanupBusIds.push(testBus.id);

    const route = await prisma.route.findFirst({ where: { active: true } });
    if (!route) {
      throw new Error('Precondition failed: At least 1 active route required in database.');
    }

    // 1.4 Create active trip
    const activeTrip = await prisma.trip.create({
      data: {
        busId: testBus.id,
        driverId: driver.id,
        routeId: route.id,
        status: TripStatus.ACTIVE,
        startTime: new Date(),
      },
    });
    cleanupTripIds.push(activeTrip.id);

    // 1.5 Create boardings for this trip (3 BOARD, 1 DROP -> net 2 passengers)
    await prisma.boardingEvent.create({
      data: {
        tripId: activeTrip.id,
        studentId: student.id,
        type: BoardingEventType.BOARD,
        method: BoardingMethod.MANUAL,
      },
    });
    await prisma.boardingEvent.create({
      data: {
        tripId: activeTrip.id,
        studentId: student.id,
        type: BoardingEventType.BOARD,
        method: BoardingMethod.MANUAL,
      },
    });
    await prisma.boardingEvent.create({
      data: {
        tripId: activeTrip.id,
        studentId: student.id,
        type: BoardingEventType.BOARD,
        method: BoardingMethod.MANUAL,
      },
    });
    await prisma.boardingEvent.create({
      data: {
        tripId: activeTrip.id,
        studentId: student.id,
        type: BoardingEventType.DROP,
        method: BoardingMethod.MANUAL,
      },
    });

    const driverTripData = await driverService.getCurrentTrip(driverUser.id);
    assert(driverTripData !== null, 'DriverService.getCurrentTrip returns assigned trip');
    assert(
      !('boardings' in (driverTripData || {})),
      'Passenger relational roster (boardings array) strictly stripped from trip query',
    );
    assert(
      !('calculatedOccupancy' in (driverTripData || {})),
      'Raw calculatedOccupancy numerical headcount suppressed from returned driver payload',
    );
    assert(
      typeof (driverTripData as any)?.occupancyPercent === 'number',
      `occupancyPercent is exposed as percentage number (${(driverTripData as any)?.occupancyPercent}%)`,
    );
    assert(
      (driverTripData as any)?.occupancyPercent >= 0 &&
        (driverTripData as any)?.occupancyPercent <= 100,
      'occupancyPercent is clamped strictly to [0, 100]',
    );
    assert(
      ['SEATS_AVAILABLE', 'STANDING_ROOM_ONLY', 'FULL'].includes(
        (driverTripData as any)?.occupancyStatus,
      ),
      `occupancyStatus maps strictly to categorical band (${(driverTripData as any)?.occupancyStatus})`,
    );

    // =========================================================================
    // 2. WEBSOCKET BROADCAST SANITIZATION
    // =========================================================================
    console.log('\n--- 2. WebSocket Broadcast Sanitization (TripsService.calculateAndBroadcastOccupancy) ---');

    capturedOccupancyPayload = null;
    await tripsService.calculateAndBroadcastOccupancy(activeTrip.id, {
      stopId: 'stop-abc-123',
      stopName: 'BMSIT Main Gate',
    });

    assert(
      capturedOccupancyPayload !== null,
      'tripsGateway.broadcastOccupancy invoked with sanitized payload',
    );
    assert(
      (capturedOccupancyPayload as any)?.tripId === activeTrip.id,
      'trip:occupancy broadcast payload includes correct tripId',
    );
    assert(
      typeof (capturedOccupancyPayload as any)?.occupancyPercent === 'number',
      'trip:occupancy broadcast payload contains occupancyPercent',
    );
    assert(
      ['SEATS_AVAILABLE', 'STANDING_ROOM_ONLY', 'FULL'].includes(
        (capturedOccupancyPayload as any)?.occupancyStatus,
      ),
      'trip:occupancy broadcast payload contains valid categorical occupancyStatus',
    );
    assert(
      typeof (capturedOccupancyPayload as any)?.timestamp === 'string',
      'trip:occupancy broadcast payload contains ISO timestamp string',
    );
    assert(
      !('occupiedSeats' in (capturedOccupancyPayload as any)),
      'trip:occupancy broadcast strictly suppresses raw occupiedSeats headcount',
    );
    assert(
      !('capacity' in (capturedOccupancyPayload as any)),
      'trip:occupancy broadcast suppresses raw capacity count',
    );
    assert(
      !('recentBoarding' in (capturedOccupancyPayload as any)),
      'trip:occupancy broadcast suppresses recentBoarding student stop telemetry',
    );

    // =========================================================================
    // 3. PRODUCTION JWT SECRET ENFORCEMENT
    // =========================================================================
    console.log('\n--- 3. Production JWT Secret Enforcement (getJwtSecret) ---');

    // 3.1 Production mode with unset JWT_SECRET must fail fast
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    let prodUnsetFailedFast = false;
    try {
      getJwtSecret();
    } catch (err: any) {
      prodUnsetFailedFast = err.message === FATAL_JWT_SECRET_ERROR;
    }
    assert(
      prodUnsetFailedFast,
      'getJwtSecret throws FATAL startup error when NODE_ENV=production and JWT_SECRET is unset',
    );

    // 3.2 Production mode with empty string JWT_SECRET must fail fast
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '   ';
    let prodEmptyFailedFast = false;
    try {
      getJwtSecret();
    } catch (err: any) {
      prodEmptyFailedFast = err.message === FATAL_JWT_SECRET_ERROR;
    }
    assert(
      prodEmptyFailedFast,
      'getJwtSecret throws FATAL startup error when NODE_ENV=production and JWT_SECRET is empty whitespace',
    );

    // 3.3 Production mode with valid JWT_SECRET succeeds
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a_very_secure_production_jwt_secret_key_12345';
    const prodValidSecret = getJwtSecret();
    assert(
      prodValidSecret === 'a_very_secure_production_jwt_secret_key_12345',
      'getJwtSecret returns configured secret in production mode',
    );

    // 3.4 Development / Test mode with unset JWT_SECRET uses fallback with warning
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    const testFallbackSecret = getJwtSecret();
    assert(
      testFallbackSecret === FALLBACK_DEV_SECRET,
      'getJwtSecret returns development fallback key in non-production environments',
    );

    // =========================================================================
    // 4. DRIVER OTP ENVIRONMENT GUARD
    // =========================================================================
    console.log('\n--- 4. Driver OTP Environment Guard (AuthService.loginDriver) ---');

    // 4.1 Production mode strictly rejects mock OTP (123456)
    process.env.NODE_ENV = 'production';
    let prodMockOtpRejected = false;
    let prodMockOtpErrorMsg = '';
    try {
      await authService.loginDriver(driverPhone, '123456');
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        prodMockOtpRejected = true;
        prodMockOtpErrorMsg = err.message;
      }
    }
    assert(
      prodMockOtpRejected,
      'AuthService.loginDriver rejects mock OTP (123456) with UnauthorizedException when NODE_ENV=production',
    );
    assert(
      prodMockOtpErrorMsg.includes('strictly prohibited in production environments'),
      'UnauthorizedException explicitly cites prohibited mock OTP in production mode',
    );

    // 4.2 Non-production mode rejects invalid OTP
    process.env.NODE_ENV = 'test';
    let devInvalidOtpRejected = false;
    try {
      await authService.loginDriver(driverPhone, '999999');
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        devInvalidOtpRejected = err.message === 'Invalid OTP';
      }
    }
    assert(
      devInvalidOtpRejected,
      'AuthService.loginDriver rejects invalid OTP with "Invalid OTP" in non-production mode',
    );

    // 4.3 Non-production mode accepts mock OTP (123456)
    process.env.NODE_ENV = 'test';
    const devLoginResult = await authService.loginDriver(driverPhone, '123456');
    assert(
      Boolean(devLoginResult?.accessToken),
      'AuthService.loginDriver issues valid auth token for mock OTP (123456) in non-production mode',
    );
  } finally {
    // Restore environment variables
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (originalJwtSecret !== undefined) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }

    // Clean up created entities
    for (const tripId of cleanupTripIds) {
      await prisma.boardingEvent.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.tripAudit.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    }

    for (const studentId of cleanupStudentIds) {
      await prisma.boardingEvent.deleteMany({ where: { studentId } }).catch(() => {});
      await prisma.student.delete({ where: { id: studentId } }).catch(() => {});
    }

    for (const driverId of cleanupDriverIds) {
      await prisma.driver.delete({ where: { id: driverId } }).catch(() => {});
    }

    for (const userId of cleanupUserIds) {
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

runSecurityMinimizationSuite().catch((err) => {
  console.error('Fatal test execution failure:', err);
  process.exit(1);
});
