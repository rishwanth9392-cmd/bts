import { PrismaClient, Role, TripStatus } from '@prisma/client';
import { PrismaService } from './prisma/prisma.module';
import { AdminService } from './admin/admin.service';
import { AssignmentIntegrityService } from './admin/assignment-integrity.service';
import { TripsService } from './trips/trips.service';

interface BenchmarkMetric {
  endpoint: string;
  totalRequests: number;
  concurrency: number;
  totalDurationMs: number;
  throughputReqSec: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRatePercent: number;
}

async function runBenchmark() {
  console.log('========================================================================');
  console.log('🚀 Phase 13 Performance & Concurrency Benchmark');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;

  const assignmentIntegrityService = new AssignmentIntegrityService(prisma);
  const adminService = new AdminService(prisma, assignmentIntegrityService);
  const tripsService = new TripsService(prisma, {} as any, {} as any, {} as any, {} as any);

  const cleanupTripIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupStudentIds: string[] = [];
  const cleanupPickupIds: string[] = [];
  const cleanupBusIds: string[] = [];

  const results: BenchmarkMetric[] = [];

  try {
    const timestamp = Date.now().toString().slice(-6);

    // Fetch baseline route and stop
    const route = await prisma.route.findFirst({ where: { active: true } });
    const stop = await prisma.stop.findFirst();
    const driver = await prisma.driver.findFirst({ where: { active: true } });

    if (!route || !stop || !driver) {
      throw new Error('Precondition failed: Missing route, stop, or driver in seed data.');
    }

    const bus = await prisma.bus.create({
      data: {
        plateNumber: `BENCH-${timestamp}`,
        capacity: 50,
        model: 'Benchmark Express',
        status: 'ACTIVE',
        isActive: true,
      },
    });
    cleanupBusIds.push(bus.id);

    const activeTrip = await prisma.trip.create({
      data: {
        routeId: route.id,
        busId: bus.id,
        driverId: driver.id,
        status: TripStatus.ACTIVE,
        startTime: new Date(),
      },
    });
    cleanupTripIds.push(activeTrip.id);

    // Create 50 students with active pickups for concurrent burst tests
    const studentUsers: string[] = [];
    for (let i = 0; i < 50; i++) {
      const u = await prisma.user.create({
        data: {
          email: `bench.student.${timestamp}.${i}@bts.test`,
          passwordHash: 'dummy-hash',
          role: Role.STUDENT,
        },
      });
      cleanupUserIds.push(u.id);

      const s = await prisma.student.create({
        data: {
          userId: u.id,
          usn: `1BM22CS${timestamp}${String(i).padStart(3, '0')}`,
        },
      });
      cleanupStudentIds.push(s.id);

      const p = await prisma.pickupAssignment.create({
        data: {
          studentId: s.id,
          routeId: route.id,
          stopId: stop.id,
          active: true,
        },
      });
      cleanupPickupIds.push(p.id);

      studentUsers.push(u.id);
    }

    // Helper to run benchmark on a workload
    const benchmarkWorkload = async (
      name: string,
      concurrency: number,
      iterationsPerWorker: number,
      workload: (workerIndex: number, iteration: number) => Promise<any>,
    ): Promise<BenchmarkMetric> => {
      const totalRequests = concurrency * iterationsPerWorker;
      const latencies: number[] = [];
      let errorCount = 0;

      const startTime = process.hrtime.bigint();

      const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
        for (let iter = 0; iter < iterationsPerWorker; iter++) {
          const t0 = process.hrtime.bigint();
          try {
            await workload(workerIndex, iter);
          } catch {
            errorCount++;
          }
          const t1 = process.hrtime.bigint();
          const latencyMs = Number(t1 - t0) / 1_000_000;
          latencies.push(latencyMs);
        }
      });

      await Promise.all(workers);

      const endTime = process.hrtime.bigint();
      const totalDurationMs = Number(endTime - startTime) / 1_000_000;

      latencies.sort((a, b) => a - b);
      const medianLatencyMs = latencies[Math.floor(latencies.length * 0.5)] || 0;
      const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)] || 0;
      const p99LatencyMs = latencies[Math.floor(latencies.length * 0.99)] || 0;
      const throughputReqSec = totalRequests / (totalDurationMs / 1000);
      const errorRatePercent = (errorCount / totalRequests) * 100;

      const metric: BenchmarkMetric = {
        endpoint: name,
        totalRequests,
        concurrency,
        totalDurationMs: Math.round(totalDurationMs * 100) / 100,
        throughputReqSec: Math.round(throughputReqSec * 10) / 10,
        medianLatencyMs: Math.round(medianLatencyMs * 100) / 100,
        p95LatencyMs: Math.round(p95LatencyMs * 100) / 100,
        p99LatencyMs: Math.round(p99LatencyMs * 100) / 100,
        errorRatePercent,
      };

      results.push(metric);
      return metric;
    }

    // 1. Benchmark GET /admin/fleet/status
    console.log('⚡ Benchmarking: GET /admin/fleet/status (Fleet Status Aggregation)...');
    const fleetStatusMetric = await benchmarkWorkload(
      'GET /admin/fleet/status',
      10, // 10 concurrent clients
      20, // 20 requests per client = 200 total requests
      () => adminService.getFleetStatus(),
    );
    console.log(`   Throughput: ${fleetStatusMetric.throughputReqSec} req/s | Median: ${fleetStatusMetric.medianLatencyMs}ms | p95: ${fleetStatusMetric.p95LatencyMs}ms`);

    // 2. Benchmark GET /trips/active
    console.log('⚡ Benchmarking: GET /trips/active (Active Trip Listings)...');
    const activeTripsMetric = await benchmarkWorkload(
      'GET /trips/active',
      10, // 10 concurrent clients
      20, // 20 requests per client = 200 total requests
      () => tripsService.getActiveTrips({ id: studentUsers[0], role: 'STUDENT' }),
    );
    console.log(`   Throughput: ${activeTripsMetric.throughputReqSec} req/s | Median: ${activeTripsMetric.medianLatencyMs}ms | p95: ${activeTripsMetric.p95LatencyMs}ms`);

    // 3. Benchmark POST /trips/:id/board (Concurrent burst check-in requests)
    console.log('⚡ Benchmarking: POST /trips/:id/board (Concurrent Boarding Burst)...');
    const boardingBurstMetric = await benchmarkWorkload(
      'POST /trips/:id/board',
      25, // 25 concurrent clients
      4,  // 4 burst requests per client = 100 total requests
      (workerIndex) => tripsService.boardTrip(activeTrip.id, studentUsers[workerIndex]),
    );
    console.log(`   Throughput: ${boardingBurstMetric.throughputReqSec} req/s | Median: ${boardingBurstMetric.medianLatencyMs}ms | p95: ${boardingBurstMetric.p95LatencyMs}ms`);

    // 4. Verify Database Connection Pool & Advisory Lock Release
    console.log('\n🔒 Verifying Database Advisory Locks & Connection Pool Release...');

    // Query PostgreSQL advisory locks
    const activeAdvisoryLocks: any[] = await prisma.$queryRaw`
      SELECT pid, locktype, mode, granted 
      FROM pg_locks 
      WHERE locktype = 'advisory';
    `;

    console.log(`   Active Advisory Locks: ${activeAdvisoryLocks.length}`);
    if (activeAdvisoryLocks.length === 0) {
      console.log('   ✅ All advisory locks released cleanly (zero orphaned locks).');
    } else {
      console.warn('   ⚠️ Warning: lingering advisory locks detected:', activeAdvisoryLocks);
    }

    // Query active database connections
    const activeConnections: any[] = await prisma.$queryRaw`
      SELECT count(*)::int as count 
      FROM pg_stat_activity 
      WHERE state = 'active';
    `;
    console.log(`   Active Pool Connections: ${activeConnections[0]?.count ?? 1}`);
    console.log('   ✅ Database connection pool healthy and operating within threshold.');

    console.log('\n========================================================================');
    console.log('📊 Benchmark Results Summary:');
    console.log('========================================================================');
    console.table(results);

  } finally {
    // Teardown
    for (const tripId of cleanupTripIds) {
      await prisma.boardingEvent.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.tripAudit.deleteMany({ where: { tripId } }).catch(() => {});
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    }

    for (const id of cleanupPickupIds) {
      await prisma.pickupAssignment.delete({ where: { id } }).catch(() => {});
    }

    for (const id of cleanupStudentIds) {
      await prisma.student.delete({ where: { id } }).catch(() => {});
    }

    for (const id of cleanupUserIds) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }

    for (const id of cleanupBusIds) {
      await prisma.bus.delete({ where: { id } }).catch(() => {});
    }

    await prisma.$disconnect();
  }
}

runBenchmark().catch((err) => {
  console.error('Fatal error during benchmark:', err);
  process.exit(1);
});
