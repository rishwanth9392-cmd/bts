import { PrismaClient, Role, TripStatus } from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

async function runIntegrityVerification() {
  console.log('🧪 Starting Assignment Integrity Engine & Admin Audit Helper Verification...\n');

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
    // 1. Fetch seed baseline entities
    const activeTrip = await prisma.trip.findFirst({
      where: { status: TripStatus.ACTIVE },
      include: { driver: true, bus: true, route: true },
    });

    if (!activeTrip) {
      throw new Error('Precondition failed: No active trip found in database. Seed baseline first.');
    }

    const { driverId, busId, routeId } = activeTrip;
    console.log(`📋 Baseline Active Trip: ${activeTrip.id}`);
    console.log(`   Driver ID: ${driverId}, Bus ID: ${busId}, Route: ${activeTrip.route.name}\n`);

    // --- TEST 1: Driver Conflict Check (Throws 409 ConflictException) ---
    console.log('--- Test Suite 1: Driver Conflict Checks ---');
    try {
      await assignmentIntegrityService.assertDriverAvailable(driverId);
      assert(false, 'Driver conflict check should throw ConflictException');
    } catch (err: any) {
      const isConflict = err instanceof ConflictException;
      const statusCode = err?.getStatus ? err.getStatus() : null;
      assert(
        isConflict && statusCode === 409,
        'Driver assigned to ACTIVE trip triggers 409 ConflictException',
        `Received: ${err.message}`,
      );
    }

    // --- TEST 2: Bus Conflict Check (Throws 409 ConflictException) ---
    console.log('\n--- Test Suite 2: Bus Conflict Checks ---');
    try {
      await assignmentIntegrityService.assertBusAvailable(busId);
      assert(false, 'Bus conflict check should throw ConflictException');
    } catch (err: any) {
      const isConflict = err instanceof ConflictException;
      const statusCode = err?.getStatus ? err.getStatus() : null;
      assert(
        isConflict && statusCode === 409,
        'Bus assigned to ACTIVE trip triggers 409 ConflictException',
        `Received: ${err.message}`,
      );
    }

    // --- TEST 3: Atomic Assignment Check via assertAndAssignTrip ---
    console.log('\n--- Test Suite 3: Atomic Assignment Wrapper Safety ---');
    try {
      await assignmentIntegrityService.assertAndAssignTrip({
        routeId,
        busId,
        driverId,
      });
      assert(false, 'assertAndAssignTrip with busy bus/driver should fail atomically');
    } catch (err: any) {
      const isConflict = err instanceof ConflictException;
      assert(
        isConflict,
        'assertAndAssignTrip aborts with ConflictException on concurrent/conflicting assignment',
        `Received: ${err.message}`,
      );
    }

    // --- TEST 4: Deactivation Safety Guard for Bus (Throws 400 BadRequestException) ---
    console.log('\n--- Test Suite 4: Deactivation Safety Guards ---');
    try {
      await assignmentIntegrityService.assertBusCanDeactivate(busId);
      assert(false, 'Deactivating bus on ACTIVE trip should throw BadRequestException');
    } catch (err: any) {
      const isBadRequest = err instanceof BadRequestException;
      const statusCode = err?.getStatus ? err.getStatus() : null;
      assert(
        isBadRequest && statusCode === 400,
        'Deactivating bus with ACTIVE trip triggers 400 BadRequestException',
        `Received: ${err.message}`,
      );
    }

    // --- TEST 5: Deactivation Safety Guard for Driver (Throws 400 BadRequestException) ---
    try {
      await assignmentIntegrityService.assertDriverCanDeactivate(driverId);
      assert(false, 'Deactivating driver on ACTIVE trip should throw BadRequestException');
    } catch (err: any) {
      const isBadRequest = err instanceof BadRequestException;
      const statusCode = err?.getStatus ? err.getStatus() : null;
      assert(
        isBadRequest && statusCode === 400,
        'Deactivating driver with ACTIVE trip triggers 400 BadRequestException',
        `Received: ${err.message}`,
      );
    }

    // --- TEST 6: Admin Audit Helper & Metadata Sanitization ---
    console.log('\n--- Test Suite 5: Admin Audit Helper & Sanitization ---');
    const adminUser = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });

    if (!adminUser) {
      throw new Error('Precondition failed: No admin user found in database.');
    }

    const sensitiveMetadata = {
      actionTarget: 'BUS_CREATION',
      plateNumber: 'KA-50-Z-9999',
      password: 'SuperSecretPassword123!',
      rawToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refreshToken: 'rf_token_9999',
      secretKey: 'top_secret',
      nested: {
        api_key: 'my_secret_key',
        safeProperty: 'visible_info',
      },
    };

    const auditLog = await adminService.logAction(
      adminUser.id,
      'BUS_CREATED',
      'BUS',
      'test-bus-id-123',
      sensitiveMetadata,
    );

    assert(Boolean(auditLog.id), 'AdminAudit record created successfully with unique ID');

    const meta = auditLog.metadata as any;
    assert(
      meta?.password === '[REDACTED]' &&
      meta?.rawToken === '[REDACTED]' &&
      meta?.refreshToken === '[REDACTED]' &&
      meta?.secretKey === '[REDACTED]' &&
      meta?.nested?.api_key === '[REDACTED]',
      'Metadata sanitization redacts sensitive passwords, tokens, and secrets',
    );
    assert(
      meta?.plateNumber === 'KA-50-Z-9999' && meta?.nested?.safeProperty === 'visible_info',
      'Metadata sanitization preserves safe non-sensitive properties',
    );

    // --- TEST 7: RBAC Guard Enforcement ---
    console.log('\n--- Test Suite 6: RBAC Guard Enforcement ---');
    const mockReflector = {
      getAllAndOverride: (key: string) => {
        if (key === ROLES_KEY) return [Role.ADMIN];
        return [];
      },
    } as unknown as Reflector;

    const rolesGuard = new RolesGuard(mockReflector);

    const createMockContext = (role: Role) => ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'test-user', role },
        }),
      }),
    } as any);

    const adminPermitted = rolesGuard.canActivate(createMockContext(Role.ADMIN));
    const driverPermitted = rolesGuard.canActivate(createMockContext(Role.DRIVER));
    const studentPermitted = rolesGuard.canActivate(createMockContext(Role.STUDENT));

    assert(adminPermitted === true, 'RolesGuard grants access to Role.ADMIN');
    assert(driverPermitted === false, 'RolesGuard rejects Role.DRIVER (403 Forbidden)');
    assert(studentPermitted === false, 'RolesGuard rejects Role.STUDENT (403 Forbidden)');

    // Teardown test audit log
    await prisma.adminAudit.delete({ where: { id: auditLog.id } });

    console.log(`\n========================================`);
    console.log(`✨ Verification Results: ${passedTests}/${totalTests} tests passed successfully!`);
    console.log(`========================================\n`);
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

runIntegrityVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
