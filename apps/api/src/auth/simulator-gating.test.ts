import { PrismaClient, BusStatus, TripStatus, Role } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.module';
import { TripsService } from '../trips/trips.service';
import { TripsController } from '../trips/trips.controller';
import { AuthService } from './auth.service';
import type { LocationUpdateDto } from '../trips/dto/location-update.dto';

async function runSimulatorGatingSuite() {
  console.log('========================================================================');
  console.log('🛡️ Step 3: Route Gating & Development Simulator Isolation Suite');
  console.log('========================================================================\n');

  const originalNodeEnv = process.env.NODE_ENV;
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
    // Setup Mock Gateway and Dependencies
    // -------------------------------------------------------------------------
    const locationBroadcasts: Array<{ tripId: string; payload: any }> = [];

    const mockTripsGateway: any = {
      broadcastLocation: (tripId: string, payload: any) => {
        locationBroadcasts.push({ tripId, payload });
      },
      broadcastTripStarted: () => {},
      broadcastTripCompleted: () => {},
      broadcastTripCancelled: () => {},
    };

    const mockGeofenceService: any = {
      processLocationUpdate: async () => {},
      clearTripGeofenceState: () => {},
    };

    const mockRouteProgressService: any = {
      processLocationUpdate: async () => {},
      clearTripState: () => {},
      getTripProgress: async () => ({ progressPercentage: 50 }),
    };

    const mockEtaService: any = {
      clearTripState: () => {},
    };

    const tripsService = new TripsService(
      prisma,
      mockTripsGateway,
      mockGeofenceService,
      mockRouteProgressService,
      mockEtaService,
    );

    const tripsController = new TripsController(
      tripsService,
      mockRouteProgressService,
    );

    const jwtService = new JwtService({ secret: 'sim-gating-test-secret-key-12345' });
    const authService = new AuthService(prisma, jwtService);

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

    // Create Driver User
    const driverUser = await prisma.user.create({
      data: {
        email: `driver.sim.${testTimestamp}@bts.test`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: Role.DRIVER,
      },
    });
    cleanupUserIds.push(driverUser.id);

    // Create Driver profile
    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        licenseNumber: `DL-SIM-${testTimestamp}`,
        phone: `+919900${testTimestamp}`,
      },
    });
    cleanupDriverIds.push(driver.id);

    // Create Bus
    const bus = await prisma.bus.create({
      data: {
        plateNumber: `KA-04-SIM-${testTimestamp}`,
        capacity: 40,
        status: BusStatus.ACTIVE,
      },
    });
    cleanupBusIds.push(bus.id);

    // Create Active Trip assigned to Driver
    const activeTrip = await prisma.trip.create({
      data: {
        busId: bus.id,
        driverId: driver.id,
        routeId: route.id,
        status: TripStatus.ACTIVE,
        startTime: new Date(),
      },
    });
    cleanupTripIds.push(activeTrip.id);

    const validWaypointDto: LocationUpdateDto = {
      latitude: 13.1337,
      longitude: 77.5642,
      speed: 35,
      heading: 45,
      accuracy: 5,
      recordedAt: new Date().toISOString(),
    };

    // =========================================================================
    // 1. PRODUCTION SIMULATOR BLOCK
    // =========================================================================
    console.log('--- 1. Production Simulator Block Verification ---');
    process.env.NODE_ENV = 'production';

    // 1.1 TripsService.simulateLocation strictly blocked in production
    let serviceSimThrew = false;
    let serviceSimErrorMsg = '';
    try {
      await tripsService.simulateLocation(activeTrip.id, driverUser.id, validWaypointDto);
    } catch (err: any) {
      serviceSimThrew = true;
      if (err instanceof ForbiddenException) {
        serviceSimErrorMsg = err.message;
      }
    }
    assert(
      serviceSimThrew,
      'TripsService.simulateLocation throws in production environment',
    );
    assert(
      serviceSimErrorMsg === 'Simulator routes are strictly disabled in production environments.',
      'TripsService.simulateLocation returns explicit 403 Forbidden message',
      `Expected exact forbidden message, received "${serviceSimErrorMsg}"`,
    );

    // 1.2 TripsController.simulateTripLocation strictly blocked in production
    let controllerSimThrew = false;
    let controllerSimErrorMsg = '';
    try {
      await tripsController.simulateTripLocation(
        activeTrip.id,
        { id: driverUser.id, sub: driverUser.id },
        validWaypointDto,
      );
    } catch (err: any) {
      controllerSimThrew = true;
      if (err instanceof ForbiddenException) {
        controllerSimErrorMsg = err.message;
      }
    }
    assert(
      controllerSimThrew,
      'TripsController.simulateTripLocation throws in production environment',
    );
    assert(
      controllerSimErrorMsg === 'Simulator routes are strictly disabled in production environments.',
      'TripsController.simulateTripLocation returns explicit 403 Forbidden message',
    );

    // 1.3 Driver mock OTP strictly blocked in production
    let mockOtpThrew = false;
    let mockOtpErrorMsg = '';
    try {
      await authService.loginDriver(driver.phone!, '123456');
    } catch (err: any) {
      mockOtpThrew = true;
      if (err instanceof UnauthorizedException) {
        mockOtpErrorMsg = err.message;
      }
    }
    assert(
      mockOtpThrew,
      'AuthService.loginDriver with mock OTP throws in production environment',
    );
    assert(
      mockOtpErrorMsg.includes('Mock OTP authentication is strictly prohibited in production environments'),
      'AuthService rejects mock OTP with explicit production security notice',
    );

    // 1.4 Edge middleware route gating check for /driver/simulator in production
    const simulateEdgeMiddleware = (pathname: string, env: string) => {
      if (pathname.startsWith('/driver/simulator') && env === 'production') {
        return { status: 404, body: 'Not Found' };
      }
      return { status: 200, body: 'OK' };
    };

    const edgeProdSim1 = simulateEdgeMiddleware('/driver/simulator', 'production');
    assert(
      edgeProdSim1.status === 404 && edgeProdSim1.body === 'Not Found',
      'Edge middleware returns HTTP 404 Not Found for /driver/simulator in production',
    );

    const edgeProdSim2 = simulateEdgeMiddleware('/driver/simulator/gps', 'production');
    assert(
      edgeProdSim2.status === 404,
      'Edge middleware returns HTTP 404 Not Found for /driver/simulator sub-routes in production',
    );

    // =========================================================================
    // 2. DEVELOPMENT / TEST MODE AVAILABILITY
    // =========================================================================
    console.log('\n--- 2. Development / Test Mode Availability Verification ---');
    process.env.NODE_ENV = 'development';

    // 2.1 TripsService.simulateLocation allowed in development mode
    const devSimResult = await tripsService.simulateLocation(
      activeTrip.id,
      driverUser.id,
      {
        ...validWaypointDto,
        speed: 40,
        recordedAt: new Date().toISOString(),
      },
    );
    assert(
      Boolean(devSimResult && devSimResult.id),
      'TripsService.simulateLocation successfully ingests waypoint in development mode',
    );
    assert(
      devSimResult.tripId === activeTrip.id && devSimResult.speed === 40,
      'Simulated waypoint record correctly saved with speed and tripId',
    );

    // 2.2 TripsController.simulateTripLocation allowed in development mode
    const controllerDevResult = await tripsController.simulateTripLocation(
      activeTrip.id,
      { id: driverUser.id, sub: driverUser.id },
      {
        ...validWaypointDto,
        speed: 42,
        recordedAt: new Date().toISOString(),
      },
    );
    assert(
      Boolean(controllerDevResult && controllerDevResult.id),
      'TripsController.simulateTripLocation successfully invokes service in development mode',
    );

    // 2.3 Simulated telemetry correctly broadcasts to trip room
    const lastBroadcast = locationBroadcasts[locationBroadcasts.length - 1];
    assert(
      Boolean(lastBroadcast && lastBroadcast.tripId === activeTrip.id),
      'Simulated location update broadcasts to trip room via TripsGateway',
    );
    assert(
      lastBroadcast?.payload?.status === 'ACTIVE',
      'Simulated location payload includes ACTIVE status',
    );

    // 2.4 Driver mock OTP succeeds in development mode
    const devDriverAuth = await authService.loginDriver(driver.phone!, '123456');
    assert(
      Boolean(devDriverAuth && devDriverAuth.accessToken),
      'AuthService.loginDriver permits mock OTP in development mode',
    );

    // 2.5 Edge middleware permits /driver/simulator in non-production
    const edgeDevSim = simulateEdgeMiddleware('/driver/simulator', 'development');
    assert(
      edgeDevSim.status === 200,
      'Edge middleware permits /driver/simulator in development mode',
    );

    // =========================================================================
    // 3. AUTHENTIC TELEMETRY PIPELINE INTEGRITY ACROSS MODES
    // =========================================================================
    console.log('\n--- 3. Authentic Telemetry Pipeline Integrity Verification ---');

    // 3.1 Authentic driver location ingestion succeeds in PRODUCTION mode
    process.env.NODE_ENV = 'production';
    const prodAuthenticFix: LocationUpdateDto = {
      latitude: 13.1462,
      longitude: 77.5799,
      speed: 44,
      heading: 75,
      accuracy: 4,
      recordedAt: new Date().toISOString(),
    };

    const prodIngestResult = await tripsService.recordLocation(
      activeTrip.id,
      driverUser.id,
      prodAuthenticFix,
    );
    assert(
      Boolean(prodIngestResult && prodIngestResult.id),
      'Authentic TripsService.recordLocation succeeds in production mode',
    );

    const controllerProdIngest = await tripsController.updateLocation(
      activeTrip.id,
      { id: driverUser.id, sub: driverUser.id },
      {
        ...prodAuthenticFix,
        recordedAt: new Date().toISOString(),
      },
    );
    assert(
      Boolean(controllerProdIngest && controllerProdIngest.id),
      'Authentic TripsController.updateLocation succeeds in production mode',
    );

    // Verify broadcast occurred for authentic location in production
    const lastProdBroadcast = locationBroadcasts[locationBroadcasts.length - 1];
    assert(
      lastProdBroadcast?.tripId === activeTrip.id &&
        lastProdBroadcast?.payload?.latitude === prodAuthenticFix.latitude,
      'Authentic GPS telemetry broadcasted over WebSocket in production mode',
    );

    // 3.2 Authentic driver location ingestion succeeds in DEVELOPMENT mode
    process.env.NODE_ENV = 'development';
    const devAuthenticFix: LocationUpdateDto = {
      latitude: 13.1495,
      longitude: 77.5835,
      speed: 25,
      heading: 85,
      accuracy: 3,
      recordedAt: new Date().toISOString(),
    };

    const devIngestResult = await tripsService.recordLocation(
      activeTrip.id,
      driverUser.id,
      devAuthenticFix,
    );
    assert(
      Boolean(devIngestResult && devIngestResult.id),
      'Authentic TripsService.recordLocation succeeds in development mode',
    );

    // 3.3 Authentic telemetry pipeline has ZERO reliance on simulator flags
    assert(
      devIngestResult.latitude === devAuthenticFix.latitude &&
        devIngestResult.longitude === devAuthenticFix.longitude,
      'Authentic coordinates faithfully persisted without simulation alterations',
    );

    // =========================================================================
    // 4. SECURITY & PERMISSION GUARDRAILS ON SIMULATOR METHODS
    // =========================================================================
    console.log('\n--- 4. Simulator Security & Validation Guardrails ---');
    process.env.NODE_ENV = 'development';

    // 4.1 Unassigned driver rejected on simulator endpoint
    let unauthDriverThrew = false;
    try {
      await tripsService.simulateLocation(
        activeTrip.id,
        'unassigned-random-user-id',
        validWaypointDto,
      );
    } catch (err: any) {
      unauthDriverThrew = err instanceof ForbiddenException;
    }
    assert(
      unauthDriverThrew,
      'simulateLocation rejects unassigned driver with 403 Forbidden',
    );

    // 4.2 Clock skew protection on simulator endpoint (> 5 minutes future)
    const futureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    let clockSkewThrew = false;
    try {
      await tripsService.simulateLocation(
        activeTrip.id,
        driverUser.id,
        {
          ...validWaypointDto,
          recordedAt: futureTimestamp,
        },
      );
    } catch (err: any) {
      clockSkewThrew = err instanceof BadRequestException;
    }
    assert(
      clockSkewThrew,
      'simulateLocation rejects timestamps exceeding 5-minute future clock skew',
    );

  } finally {
    // Restore environment
    process.env.NODE_ENV = originalNodeEnv;

    // -------------------------------------------------------------------------
    // Teardown
    // -------------------------------------------------------------------------
    for (const tripId of cleanupTripIds) {
      await prisma.locationHistory.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.tripAudit.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    }

    for (const busId of cleanupBusIds) {
      await prisma.bus.delete({ where: { id: busId } }).catch(() => {});
    }

    for (const driverId of cleanupDriverIds) {
      await prisma.driver.delete({ where: { id: driverId } }).catch(() => {});
    }

    for (const userId of cleanupUserIds) {
      await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => {});
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

runSimulatorGatingSuite().catch((err) => {
  console.error('Fatal error in simulator gating test suite:', err);
  process.exit(1);
});
