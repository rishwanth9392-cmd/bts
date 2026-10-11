import { PrismaClient, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { TripsService } from './trips.service';
import { RouteProgressService } from './route-progress.service';
import { GeofenceService } from './geofence.service';
import { TripsGateway } from './trips.gateway';
import { AdminService } from '../admin/admin.service';
import { AssignmentIntegrityService } from '../admin/assignment-integrity.service';
import { RoutesService } from '../routes/routes.service';
import { EtaService } from './eta.service';
import {
  evaluateTelemetryFreshness,
  getFreshnessTier,
} from '../common/utils/eta.util';
import {
  TELEMETRY_STALE,
  TELEMETRY_OFFLINE,
  TELEMETRY_RECOVERED,
  TelemetryWarningPayload,
} from '@bts/shared';

async function runTelemetryFreshnessVerification() {
  console.log('========================================================================');
  console.log('🧪 Step 4: GPS Freshness Standardization & Operational Warning Throttling');
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

  try {
    // -------------------------------------------------------------------------
    // Set up mock gateway to capture emitted warnings
    // -------------------------------------------------------------------------
    const emittedWarnings: Array<{ event: string; payload: TelemetryWarningPayload }> = [];
    const mockTripsGateway = {
      broadcastLocation: () => {},
      broadcastTripStarted: () => {},
      broadcastTripCompleted: () => {},
      broadcastTripCancelled: () => {},
      broadcastTripProgress: () => {},
      emitStudentEta: () => {},
      broadcastAdminSos: () => {},
      broadcastTelemetryWarning: (event: string, payload: TelemetryWarningPayload) => {
        emittedWarnings.push({ event, payload });
      },
    } as unknown as TripsGateway;

    const geofenceService = new GeofenceService(prisma, mockTripsGateway, {} as any);
    const routeProgressService = new RouteProgressService(
      prisma,
      geofenceService,
      mockTripsGateway,
    );
    const etaService = new EtaService(prisma, mockTripsGateway);
    const tripsService = new TripsService(
      prisma,
      mockTripsGateway,
      geofenceService,
      routeProgressService,
      etaService,
    );
    const assignmentIntegrityService = new AssignmentIntegrityService(prisma);
    const adminService = new AdminService(prisma, assignmentIntegrityService);
    const routesService = new RoutesService(prisma);

    // =========================================================================
    // 1. EXACT BOUNDARY TIERS
    // =========================================================================
    console.log('--- 1. Exact Freshness Boundary Tiers (0s-30s LIVE, 31s-120s STALE, >120s OFFLINE) ---');

    const nowFixed = 1760000000000; // Fixed timestamp reference

    // Tier 1: LIVE (0s <= delta <= 30s)
    assert(getFreshnessTier(0) === 'LIVE', '0s delta maps to LIVE');
    assert(getFreshnessTier(15) === 'LIVE', '15s delta maps to LIVE');
    assert(getFreshnessTier(29) === 'LIVE', '29s delta maps to LIVE');
    assert(getFreshnessTier(30) === 'LIVE', '30s exact upper boundary maps to LIVE');

    const eval0s = evaluateTelemetryFreshness(new Date(nowFixed), nowFixed);
    assert(eval0s.tier === 'LIVE' && eval0s.freshness === 'LIVE', '0s evaluation yields LIVE tier');
    assert(!eval0s.isStale, '0s delta isStale is false');
    assert(eval0s.status === 'ACTIVE', '0s delta status is ACTIVE');
    assert(eval0s.ageSeconds === 0, '0s delta ageSeconds is 0');

    const eval29s = evaluateTelemetryFreshness(new Date(nowFixed - 29 * 1000), nowFixed);
    assert(eval29s.tier === 'LIVE' && eval29s.freshness === 'LIVE', '29s evaluation yields LIVE tier');
    assert(!eval29s.isStale, '29s delta isStale is false');
    assert(eval29s.ageSeconds === 29, '29s delta ageSeconds is 29');

    const eval30s = evaluateTelemetryFreshness(new Date(nowFixed - 30 * 1000), nowFixed);
    assert(eval30s.tier === 'LIVE' && eval30s.freshness === 'LIVE', '30s exact boundary evaluation yields LIVE tier');
    assert(!eval30s.isStale, '30s delta isStale is false');
    assert(eval30s.ageSeconds === 30, '30s delta ageSeconds is 30');

    // Tier 2: STALE (31s <= delta <= 120s)
    assert(getFreshnessTier(31) === 'STALE', '31s exact lower boundary maps to STALE');
    assert(getFreshnessTier(60) === 'STALE', '60s delta maps to STALE');
    assert(getFreshnessTier(90) === 'STALE', '90s delta maps to STALE');
    assert(getFreshnessTier(120) === 'STALE', '120s exact upper boundary maps to STALE');

    const eval31s = evaluateTelemetryFreshness(new Date(nowFixed - 31 * 1000), nowFixed);
    assert(eval31s.tier === 'STALE' && eval31s.freshness === 'STALE', '31s evaluation yields STALE tier');
    assert(eval31s.isStale, '31s delta isStale is true');
    assert(eval31s.status === 'STALE', '31s delta status is STALE');
    assert(eval31s.ageSeconds === 31, '31s delta ageSeconds is 31');

    const eval120s = evaluateTelemetryFreshness(new Date(nowFixed - 120 * 1000), nowFixed);
    assert(eval120s.tier === 'STALE' && eval120s.freshness === 'STALE', '120s exact boundary yields STALE tier');
    assert(eval120s.isStale, '120s delta isStale is true');
    assert(eval120s.ageSeconds === 120, '120s delta ageSeconds is 120');

    // Tier 3: OFFLINE (delta > 120s or missing)
    assert(getFreshnessTier(121) === 'OFFLINE', '121s exact lower boundary maps to OFFLINE');
    assert(getFreshnessTier(300) === 'OFFLINE', '300s delta maps to OFFLINE');
    assert(getFreshnessTier(3600) === 'OFFLINE', '1 hour delta maps to OFFLINE');

    const eval121s = evaluateTelemetryFreshness(new Date(nowFixed - 121 * 1000), nowFixed);
    assert(eval121s.tier === 'OFFLINE' && eval121s.freshness === 'OFFLINE', '121s evaluation yields OFFLINE tier');
    assert(eval121s.isStale, '121s delta isStale is true');
    assert(eval121s.status === 'OFFLINE', '121s delta status is OFFLINE');
    assert(eval121s.ageSeconds === 121, '121s delta ageSeconds is 121');

    const eval300s = evaluateTelemetryFreshness(new Date(nowFixed - 300 * 1000), nowFixed);
    assert(eval300s.tier === 'OFFLINE' && eval300s.freshness === 'OFFLINE', '300s evaluation yields OFFLINE tier');
    assert(eval300s.isStale, '300s delta isStale is true');

    const evalNull = evaluateTelemetryFreshness(null, nowFixed);
    assert(evalNull.tier === 'OFFLINE' && evalNull.freshness === 'OFFLINE', 'null timestamp yields OFFLINE tier');
    assert(evalNull.isStale, 'null timestamp isStale is true');
    assert(evalNull.ageSeconds === null, 'null timestamp ageSeconds is null');

    const evalUndefined = evaluateTelemetryFreshness(undefined, nowFixed);
    assert(evalUndefined.tier === 'OFFLINE', 'undefined timestamp yields OFFLINE tier');

    // =========================================================================
    // 2. ETA GUARDING, CONFIDENCE & LOW-CONFIDENCE SUPPRESSION
    // =========================================================================
    console.log('\n--- 2. ETA Guarding & Low-Confidence Suppression ---');

    // A. LIVE Telemetry ETA calculation
    const liveEta = etaService.calculateGuardedEta({
      distanceMeters: 5000, // 5km
      speedKmh: 30, // 30 km/h -> 10 minutes
      recordedAt: new Date(nowFixed - 15 * 1000), // 15s ago (LIVE)
      scheduledTime: '08:30 AM',
      now: nowFixed,
    });
    assert(liveEta.freshness === 'LIVE', 'Live telemetry guardedEta freshness is LIVE');
    assert(!liveEta.isStale, 'Live telemetry guardedEta isStale is false');
    assert(liveEta.etaMinutes === 10, 'Live telemetry produces smooth integer etaMinutes: 10');
    assert(liveEta.etaSeconds === 600, 'Live telemetry produces smooth integer etaSeconds: 600');
    assert(liveEta.delayStatus !== 'UNKNOWN', 'Live telemetry computes valid delayStatus (not UNKNOWN)');

    // B. STALE Telemetry ETA calculation (Stale confidence flag)
    const staleEta = etaService.calculateGuardedEta({
      distanceMeters: 5000,
      speedKmh: 30,
      recordedAt: new Date(nowFixed - 60 * 1000), // 60s ago (STALE)
      scheduledTime: '08:30 AM',
      now: nowFixed,
    });
    assert(staleEta.freshness === 'STALE', 'Stale telemetry guardedEta freshness is STALE');
    assert(staleEta.isStale, 'Stale telemetry guardedEta isStale is true');
    assert(staleEta.etaMinutes === 10, 'Stale telemetry retains integer ETA value');
    assert(staleEta.delayStatus === 'UNKNOWN', 'Stale telemetry suppresses delayStatus to UNKNOWN');

    // C. OFFLINE Telemetry ETA calculation (Full ETA suppression)
    const offlineEta = etaService.calculateGuardedEta({
      distanceMeters: 5000,
      speedKmh: 30,
      recordedAt: new Date(nowFixed - 180 * 1000), // 180s ago (OFFLINE)
      scheduledTime: '08:30 AM',
      now: nowFixed,
    });
    assert(offlineEta.freshness === 'OFFLINE', 'Offline telemetry guardedEta freshness is OFFLINE');
    assert(offlineEta.isStale, 'Offline telemetry guardedEta isStale is true');
    assert(offlineEta.etaMinutes === null, 'Offline telemetry strictly suppresses etaMinutes to null');
    assert(offlineEta.etaSeconds === null, 'Offline telemetry strictly suppresses etaSeconds to null');
    assert(offlineEta.delayStatus === 'UNKNOWN', 'Offline telemetry marks delayStatus strictly UNKNOWN');

    // D. Missing Telemetry ETA calculation
    const missingEta = etaService.calculateGuardedEta({
      distanceMeters: 5000,
      recordedAt: null,
      now: nowFixed,
    });
    assert(missingEta.freshness === 'OFFLINE', 'Missing telemetry guardedEta freshness is OFFLINE');
    assert(missingEta.etaMinutes === null, 'Missing telemetry etaMinutes is null');
    assert(missingEta.delayStatus === 'UNKNOWN', 'Missing telemetry delayStatus is UNKNOWN');

    // =========================================================================
    // 3. TELEMETRY RECOVERY & COORDINATE INTEGRITY (DATABASE INTEGRATION)
    // =========================================================================
    console.log('\n--- 3. Telemetry Recovery & Coordinate Integrity ---');

    // Find active trip in database
    const baselineTrip = await prisma.trip.findFirst({
      where: { status: TripStatus.ACTIVE },
      include: { bus: true, route: true },
    });

    if (!baselineTrip) {
      throw new Error('Precondition failed: No active trip found in database.');
    }

    const testTripId = baselineTrip.id;
    const testBusId = baselineTrip.busId;

    // Ensure baseline route stops have valid coordinates for route progress computation
    const baselineRouteStops = await prisma.routeStop.findMany({
      where: { routeId: baselineTrip.routeId },
      orderBy: { sequence: 'asc' },
    });
    for (let i = 0; i < baselineRouteStops.length; i++) {
      await prisma.stop.update({
        where: { id: baselineRouteStops[i].stopId },
        data: {
          lat: 13.13400 + (i + 1) * 0.005,
          lng: 77.56800 + (i + 1) * 0.005,
        },
      });
    }

    // A. Seed an OFFLINE location (> 120s old)
    await prisma.locationHistory.deleteMany({
      where: { tripId: testTripId },
    });

    const offlineTimestamp = new Date(Date.now() - 200 * 1000);
    const fixedOfflineLat = 13.13401;
    const fixedOfflineLng = 77.56855;

    await prisma.locationHistory.create({
      data: {
        tripId: testTripId,
        busId: testBusId,
        latitude: fixedOfflineLat,
        longitude: fixedOfflineLng,
        speed: 25.0,
        recordedAt: offlineTimestamp,
      },
    });

    // Check getLatestLocation integrity
    const latestOfflineLocation: any = await tripsService.getLatestLocation(testTripId);
    assert(
      latestOfflineLocation.latitude === fixedOfflineLat &&
        latestOfflineLocation.longitude === fixedOfflineLng,
      'getLatestLocation returns exact recorded coordinates without dead-reckoned drift',
    );
    assert(latestOfflineLocation.freshness === 'OFFLINE', 'getLatestLocation marks 200s record as OFFLINE');
    assert(latestOfflineLocation.isStale === true, 'getLatestLocation marks 200s record isStale = true');

    // Check RouteProgressService under OFFLINE state
    const offlineProgress = await routeProgressService.getTripProgress(testTripId);
    assert(offlineProgress.freshness === 'OFFLINE', 'getTripProgress reports freshness: OFFLINE');
    assert(offlineProgress.isStale === true, 'getTripProgress reports isStale: true');
    assert(offlineProgress.nextStopEtaMinutes === null, 'getTripProgress suppresses nextStopEtaMinutes to null');
    assert(offlineProgress.etaSeconds === null, 'getTripProgress suppresses etaSeconds to null');
    assert(offlineProgress.delayStatus === 'UNKNOWN', 'getTripProgress reports delayStatus: UNKNOWN');

    // B. Ingest a FRESH location record (<= 30s old) -> TELEMETRY RECOVERY
    const freshTimestamp = new Date(Date.now() - 5 * 1000); // 5s ago
    const fixedFreshLat = 13.13425;
    const fixedFreshLng = 77.56875;

    await prisma.locationHistory.create({
      data: {
        tripId: testTripId,
        busId: testBusId,
        latitude: fixedFreshLat,
        longitude: fixedFreshLng,
        speed: 30.0,
        recordedAt: freshTimestamp,
      },
    });

    // Verify immediate recovery to LIVE in RouteProgressService
    const recoveredProgress = await routeProgressService.getTripProgress(testTripId);
    assert(recoveredProgress.freshness === 'LIVE', 'Recovery: Fresh GPS transitions status back to LIVE immediately');
    assert(recoveredProgress.isStale === false, 'Recovery: isStale flag cleared immediately (false)');
    assert(
      recoveredProgress.nextStopEtaMinutes !== null &&
        Number.isInteger(recoveredProgress.nextStopEtaMinutes),
      'Recovery: Smooth integer nextStopEtaMinutes restored',
    );
    assert(
      recoveredProgress.etaSeconds !== null &&
        recoveredProgress.etaSeconds === recoveredProgress.nextStopEtaMinutes! * 60,
      'Recovery: Accurate etaSeconds restored (minutes * 60)',
    );

    // Verify recovery in getLatestLocation
    const recoveredLocation: any = await tripsService.getLatestLocation(testTripId);
    assert(recoveredLocation.freshness === 'LIVE', 'Recovery: getLatestLocation returns freshness: LIVE');
    assert(recoveredLocation.isStale === false, 'Recovery: getLatestLocation isStale is false');
    assert(recoveredLocation.latitude === fixedFreshLat, 'Coordinates match freshly ingested fix exactly');

    // =========================================================================
    // 4. OPERATIONAL WARNING ALERT THROTTLING & DEDUPLICATION
    // =========================================================================
    console.log('\n--- 4. Warning Alert Throttling & Deduplication ---');

    emittedWarnings.length = 0; // Reset captured events
    const tripA = 'trip-mock-alpha-123';
    etaService.clearTripState(tripA);

    // Initial Registration as LIVE -> 0 warnings emitted
    const t0 = etaService.evaluateTransitionAndAlert(tripA, 'LIVE', { busId: 'bus-1' });
    assert(!t0.transitioned, 'Initial healthy LIVE registration emits 0 warnings');
    assert(emittedWarnings.length === 0, 'No warning events dispatched on healthy baseline');

    // Repeated check while still LIVE -> 0 warnings
    const t0Repeat = etaService.evaluateTransitionAndAlert(tripA, 'LIVE', { busId: 'bus-1' });
    assert(!t0Repeat.transitioned, 'Repeated check in LIVE state is deduplicated (0 warnings)');
    assert(emittedWarnings.length === 0, 'emittedWarnings count remains 0');

    // State Transition 1: LIVE -> STALE
    const t1 = etaService.evaluateTransitionAndAlert(tripA, 'STALE', {
      busId: 'bus-1',
      plateNumber: 'KA-04-F-1234',
      ageSeconds: 45,
    });
    assert(t1.transitioned, 'Transition LIVE -> STALE detected');
    assert(t1.event === TELEMETRY_STALE, 'Transition emits telemetry:stale event');
    assert(emittedWarnings.length === 1, 'Exactly 1 warning event emitted so far');
    assert(emittedWarnings[0].event === TELEMETRY_STALE, 'Emitted event matches telemetry:stale');
    assert(emittedWarnings[0].payload.currentState === 'STALE', 'Event payload currentState is STALE');
    assert(emittedWarnings[0].payload.previousState === 'LIVE', 'Event payload previousState is LIVE');

    // Repeated checks in STALE state across recurring polling intervals
    const t1Repeat1 = etaService.evaluateTransitionAndAlert(tripA, 'STALE', { ageSeconds: 60 });
    const t1Repeat2 = etaService.evaluateTransitionAndAlert(tripA, 'STALE', { ageSeconds: 75 });
    const t1Repeat3 = etaService.evaluateTransitionAndAlert(tripA, 'STALE', { ageSeconds: 100 });
    assert(!t1Repeat1.transitioned && !t1Repeat2.transitioned && !t1Repeat3.transitioned, 'Repeated checks in STALE state are throttled and suppressed');
    assert(emittedWarnings.length === 1, 'Deduplication: Still exactly 1 event emitted (zero alert spam)');

    // State Transition 2: STALE -> OFFLINE
    const t2 = etaService.evaluateTransitionAndAlert(tripA, 'OFFLINE', {
      busId: 'bus-1',
      plateNumber: 'KA-04-F-1234',
      ageSeconds: 150,
    });
    assert(t2.transitioned, 'Transition STALE -> OFFLINE detected');
    assert(t2.event === TELEMETRY_OFFLINE, 'Transition emits telemetry:offline event');
    assert(emittedWarnings.length === 2, 'Exactly 2 warning events emitted so far');
    assert(emittedWarnings[1].event === TELEMETRY_OFFLINE, 'Second emitted event is telemetry:offline');
    assert(emittedWarnings[1].payload.previousState === 'STALE', 'Event payload previousState is STALE');
    assert(emittedWarnings[1].payload.currentState === 'OFFLINE', 'Event payload currentState is OFFLINE');

    // Repeated checks in OFFLINE state across recurring intervals
    const t2Repeat1 = etaService.evaluateTransitionAndAlert(tripA, 'OFFLINE', { ageSeconds: 180 });
    const t2Repeat2 = etaService.evaluateTransitionAndAlert(tripA, 'OFFLINE', { ageSeconds: 300 });
    assert(!t2Repeat1.transitioned && !t2Repeat2.transitioned, 'Repeated checks in OFFLINE state are throttled and suppressed');
    assert(emittedWarnings.length === 2, 'Deduplication: Still exactly 2 events emitted (zero alert spam)');

    // State Transition 3: OFFLINE -> LIVE Recovery
    const t3 = etaService.evaluateTransitionAndAlert(tripA, 'LIVE', {
      busId: 'bus-1',
      plateNumber: 'KA-04-F-1234',
      ageSeconds: 10,
    });
    assert(t3.transitioned, 'Transition OFFLINE -> LIVE detected (Recovery)');
    assert(t3.event === TELEMETRY_RECOVERED, 'Recovery emits telemetry:recovered event');
    assert(emittedWarnings.length === 3, 'Exactly 3 warning events emitted in total');
    assert(emittedWarnings[2].payload.previousState === 'OFFLINE', 'Recovery previousState is OFFLINE');
    assert(emittedWarnings[2].payload.currentState === 'LIVE', 'Recovery currentState is LIVE');

    // Repeated checks in LIVE state after recovery
    const t3Repeat = etaService.evaluateTransitionAndAlert(tripA, 'LIVE', { ageSeconds: 15 });
    assert(!t3Repeat.transitioned, 'Repeated check after recovery is suppressed');
    assert(emittedWarnings.length === 3, 'Total events remains 3 after recurring checks');

    // Fleet background monitoring helper
    etaService.clearTripState(testTripId);
    const fleetMonitor1 = await etaService.monitorFleetTelemetry();
    assert(typeof fleetMonitor1.checked === 'number', 'monitorFleetTelemetry checks active trips');
    const fleetMonitor2 = await etaService.monitorFleetTelemetry();
    assert(fleetMonitor2.transitions.length === 0, 'Successive fleet monitor call with unchanged states produces 0 transitions');

    // =========================================================================
    // 5. API SERVICES CONSISTENCY (ADMIN & ROUTES)
    // =========================================================================
    console.log('\n--- 5. API Services Consistency Across Admin & Routes ---');

    // Admin fleet status telemetry buckets
    const fleetStatus = await adminService.getFleetStatus();
    assert(typeof fleetStatus.telemetry.active === 'number', 'Admin getFleetStatus reports telemetry.active');
    assert(typeof fleetStatus.telemetry.live === 'number', 'Admin getFleetStatus reports telemetry.live alias');
    assert(typeof fleetStatus.telemetry.stale === 'number', 'Admin getFleetStatus reports telemetry.stale');
    assert(typeof fleetStatus.telemetry.offline === 'number', 'Admin getFleetStatus reports telemetry.offline');

    // Admin trips list telemetry formatting
    const adminTrips = await adminService.getTrips();
    assert(Array.isArray(adminTrips.data), 'Admin getTrips returns paginated trips');
    if (adminTrips.data.length > 0) {
      const firstTrip = adminTrips.data[0];
      assert(typeof firstTrip.telemetry === 'object', 'Admin trip contains telemetry object');
      assert('freshness' in firstTrip.telemetry, 'Admin trip telemetry includes freshness tier');
      assert('isStale' in firstTrip.telemetry, 'Admin trip telemetry includes isStale flag');
      assert('status' in firstTrip.telemetry, 'Admin trip telemetry includes status');
    }

    // Routes service active trip telemetry
    const routeTelemetry = await routesService.getRouteActiveTrips(baselineTrip.routeId);
    assert(Array.isArray(routeTelemetry), 'routesService.getRouteActiveTrips returns active trip array');
    if (routeTelemetry.length > 0) {
      const routeTrip = routeTelemetry[0];
      assert(typeof routeTrip.telemetry === 'object', 'Route active trip contains telemetry');
      assert(
        routeTrip.telemetry.freshness === 'LIVE' ||
          routeTrip.telemetry.freshness === 'STALE' ||
          routeTrip.telemetry.freshness === 'OFFLINE',
        'Route active trip telemetry freshness adheres strictly to unified tiers (LIVE | STALE | OFFLINE)',
      );
      assert(typeof routeTrip.telemetry.isStale === 'boolean', 'Route active trip telemetry has boolean isStale flag');
    }

  } catch (error) {
    console.error('Unhandled test suite error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
  console.log('========================================================================\n');

  if (passedTests === totalTests && totalTests > 0) {
    console.log('🎉 ALL TELEMETRY FRESHNESS & THROTTLING ASSERTIONS PASSED CLEANLY!\n');
  } else {
    console.error('💥 SOME ASSERTIONS FAILED.\n');
    process.exit(1);
  }
}

runTelemetryFreshnessVerification();
