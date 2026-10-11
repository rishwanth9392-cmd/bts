import { PrismaClient, BusStatus, MaintenanceCategory, MaintenanceStatus, Role } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { PrismaService } from '../prisma/prisma.module';

async function runMaintenanceHardeningTests() {
  console.log('========================================================================');
  console.log('🧪 Step 5: Maintenance Workflow Hardening & Dispatch Restrictions Test Suite');
  console.log('========================================================================\n');

  const prisma = new PrismaClient() as unknown as PrismaService;
  const assignmentIntegrityService = new AssignmentIntegrityService(prisma);
  const adminService = new AdminService(prisma, assignmentIntegrityService);

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

  // Tracking IDs for cleanup
  const createdTicketIds: string[] = [];
  const createdBusIds: string[] = [];
  const createdTripIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // Preconditions & Baseline Entities
    // -------------------------------------------------------------------------
    const adminUser = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });
    if (!adminUser) {
      throw new Error('Precondition failed: No admin user found in database.');
    }

    const testRoute = await prisma.route.findFirst({
      where: { active: true },
    });
    if (!testRoute) {
      throw new Error('Precondition failed: No active route found in database.');
    }

    const testDriver = await prisma.driver.findFirst({
      where: { active: true, isActive: true },
    });
    if (!testDriver) {
      throw new Error('Precondition failed: No active driver found in database.');
    }

    // Create dedicated test bus
    const testBus1 = await prisma.bus.create({
      data: {
        plateNumber: `MNT-${Date.now().toString().slice(-6)}`,
        model: 'Tata Marcopolo Test',
        capacity: 40,
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });
    createdBusIds.push(testBus1.id);

    // =========================================================================
    // 1. STATE TRANSITION RULES & AUDIT OWNERSHIP
    // =========================================================================
    console.log('--- 1. State Transition Rules & Audit Ownership ---');

    // 1.1 Ticket Creation: Sets status REPORTED, reportedById, and logs MAINTENANCE_CREATED
    const ticket1 = await adminService.createMaintenanceTicket(
      {
        busId: testBus1.id,
        category: MaintenanceCategory.GENERAL,
        description: 'Brake pads worn past safety threshold',
        notes: 'Initial inspection during morning pre-check',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      },
      adminUser.id,
    );
    createdTicketIds.push(ticket1.id);

    assert(
      ticket1.status === MaintenanceStatus.REPORTED,
      'Ticket created with initial status REPORTED',
    );
    assert(
      ticket1.reportedById === adminUser.id,
      'Ticket creation atomically records reportedById with admin ID',
    );
    assert(
      ticket1.dueDate !== null,
      'Ticket dueDate persisted correctly',
    );

    const createAudit = await prisma.adminAudit.findFirst({
      where: { action: 'MAINTENANCE_CREATED', targetId: ticket1.id },
    });
    assert(
      Boolean(createAudit) && createAudit?.adminId === adminUser.id,
      'AdminAudit logs MAINTENANCE_CREATED with adminId and targetId',
    );

    // 1.2 Legal Linear Transition: REPORTED -> IN_PROGRESS
    const updatedToInProgress = await adminService.updateMaintenanceTicket(
      ticket1.id,
      {
        status: MaintenanceStatus.IN_PROGRESS,
        notes: 'Work order accepted by mechanic team in bay 2',
      },
      adminUser.id,
    );

    assert(
      updatedToInProgress.status === MaintenanceStatus.IN_PROGRESS,
      'Legal transition from REPORTED -> IN_PROGRESS succeeds',
    );

    const updateAudit = await prisma.adminAudit.findFirst({
      where: { action: 'MAINTENANCE_UPDATED', targetId: ticket1.id },
      orderBy: { timestamp: 'desc' },
    });
    assert(
      Boolean(updateAudit) && (updateAudit?.metadata as any)?.newStatus === 'IN_PROGRESS',
      'AdminAudit logs MAINTENANCE_UPDATED for transition to IN_PROGRESS',
    );

    // 1.3 Illegal Transition: IN_PROGRESS -> REPORTED (Backwards transition)
    let caughtIllegalBackward = false;
    try {
      await adminService.updateMaintenanceTicket(
        ticket1.id,
        { status: MaintenanceStatus.REPORTED },
        adminUser.id,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtIllegalBackward = true;
      }
    }
    assert(
      caughtIllegalBackward,
      'Illegal backwards transition (IN_PROGRESS -> REPORTED) strictly rejected with 400 BadRequestException',
    );

    // =========================================================================
    // 2. RESOLUTION VALIDATION & ACCOUNTABILITY
    // =========================================================================
    console.log('\n--- 2. Resolution Validation & Accountability ---');

    // 2.1 Rejects empty resolution notes (< 5 chars or empty)
    let caughtEmptyNotes = false;
    try {
      await adminService.updateMaintenanceTicket(
        ticket1.id,
        { status: MaintenanceStatus.RESOLVED, notes: '' },
        adminUser.id,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtEmptyNotes = true;
      }
    }
    assert(
      caughtEmptyNotes,
      'Resolving ticket with empty notes strictly rejected with 400 BadRequestException',
    );

    let caughtShortNotes = false;
    try {
      await adminService.updateMaintenanceTicket(
        ticket1.id,
        { status: MaintenanceStatus.RESOLVED, notes: 'done' },
        adminUser.id,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtShortNotes = true;
      }
    }
    assert(
      caughtShortNotes,
      'Resolving ticket with notes shorter than 5 chars rejected with 400 BadRequestException',
    );

    let caughtMissingNotes = false;
    try {
      await adminService.updateMaintenanceTicket(
        ticket1.id,
        { status: MaintenanceStatus.RESOLVED },
        adminUser.id,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtMissingNotes = true;
      }
    }
    assert(
      caughtMissingNotes,
      'Resolving ticket without providing resolution notes rejected with 400 BadRequestException',
    );

    // 2.2 Legal Resolution: IN_PROGRESS -> RESOLVED with valid resolution notes (>= 5 chars)
    const resolvedTicket = await adminService.updateMaintenanceTicket(
      ticket1.id,
      {
        status: MaintenanceStatus.RESOLVED,
        notes: 'Installed new heavy-duty ceramic brake pads and bled hydraulic lines',
      },
      adminUser.id,
    );

    assert(
      resolvedTicket.status === MaintenanceStatus.RESOLVED,
      'Legal transition from IN_PROGRESS -> RESOLVED succeeds with valid notes',
    );
    assert(
      resolvedTicket.resolvedAt !== null,
      'resolvedAt timestamp atomically populated upon resolution',
    );
    assert(
      resolvedTicket.resolvedById === adminUser.id,
      'resolvedById atomically stamped with admin ID upon resolution',
    );

    const resolveAudit = await prisma.adminAudit.findFirst({
      where: { action: 'MAINTENANCE_RESOLVED', targetId: ticket1.id },
    });
    assert(
      Boolean(resolveAudit) && resolveAudit?.adminId === adminUser.id,
      'AdminAudit logs MAINTENANCE_RESOLVED upon ticket resolution',
    );

    // 2.3 State Lock: Cannot modify an already RESOLVED ticket
    let caughtModifyResolved = false;
    try {
      await adminService.updateMaintenanceTicket(
        ticket1.id,
        { status: MaintenanceStatus.IN_PROGRESS },
        adminUser.id,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtModifyResolved = true;
      }
    }
    assert(
      caughtModifyResolved,
      'Attempt to transition an already RESOLVED ticket to IN_PROGRESS rejected with 400',
    );

    let caughtReopenReported = false;
    try {
      await adminService.updateMaintenanceTicket(
        ticket1.id,
        { status: MaintenanceStatus.REPORTED },
        adminUser.id,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtReopenReported = true;
      }
    }
    assert(
      caughtReopenReported,
      'Attempt to re-open an already RESOLVED ticket back to REPORTED rejected with 400',
    );

    // 2.4 Direct Resolution: REPORTED -> RESOLVED (Fast track with resolution notes)
    const ticket2 = await adminService.createMaintenanceTicket(
      {
        busId: testBus1.id,
        category: MaintenanceCategory.ELECTRICAL,
        description: 'Blown fuse on cabin light cluster',
      },
      adminUser.id,
    );
    createdTicketIds.push(ticket2.id);

    const directResolved = await adminService.updateMaintenanceTicket(
      ticket2.id,
      {
        status: MaintenanceStatus.RESOLVED,
        notes: 'Replaced 15A mini fuse, verified cabin light circuits',
      },
      adminUser.id,
    );

    assert(
      directResolved.status === MaintenanceStatus.RESOLVED,
      'Direct transition from REPORTED -> RESOLVED succeeds with fix notes',
    );
    assert(
      directResolved.resolvedAt !== null && directResolved.resolvedById === adminUser.id,
      'Direct resolution sets resolvedAt and resolvedById correctly',
    );

    // =========================================================================
    // 3. BACKEND DISPATCH INTEGRITY & BLOCKING
    // =========================================================================
    console.log('\n--- 3. Backend Dispatch Integrity & Blocking ---');

    // Create a new test bus specifically for dispatch blocking tests
    const testBus2 = await prisma.bus.create({
      data: {
        plateNumber: `MNT2-${Date.now().toString().slice(-6)}`,
        model: 'Ashok Leyland Test',
        capacity: 50,
        status: BusStatus.MAINTENANCE,
        isActive: true,
      },
    });
    createdBusIds.push(testBus2.id);

    // 3.1 Rejects dispatching a bus with status MAINTENANCE
    let caughtBusStatusMaint = false;
    try {
      await assignmentIntegrityService.assertBusAvailable(testBus2.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtBusStatusMaint = true;
      }
    }
    assert(
      caughtBusStatusMaint,
      'assertBusAvailable strictly rejects bus with status MAINTENANCE with 400',
    );

    // 3.2 Rejects dispatching an inactive bus (isActive: false)
    await prisma.bus.update({
      where: { id: testBus2.id },
      data: { status: BusStatus.INACTIVE, isActive: false },
    });

    let caughtInactiveBus = false;
    try {
      await assignmentIntegrityService.assertBusAvailable(testBus2.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtInactiveBus = true;
      }
    }
    assert(
      caughtInactiveBus,
      'assertBusAvailable strictly rejects bus with isActive === false with 400',
    );

    // 3.3 Rejects dispatching a bus with an open ticket, even if bus.status was mistakenly left as ACTIVE
    await prisma.bus.update({
      where: { id: testBus2.id },
      data: { status: BusStatus.ACTIVE, isActive: true },
    });

    // Create an open ticket (REPORTED) on testBus2
    const openTicket = await adminService.createMaintenanceTicket(
      {
        busId: testBus2.id,
        category: MaintenanceCategory.ENGINE,
        description: 'Oil pressure sensor intermittent warning',
      },
      adminUser.id,
    );
    createdTicketIds.push(openTicket.id);

    let caughtOpenTicketDispatch = false;
    let openTicketErrorMessage = '';
    try {
      await assignmentIntegrityService.assertBusAvailable(testBus2.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtOpenTicketDispatch = true;
        openTicketErrorMessage = err.message;
      }
    }
    assert(
      caughtOpenTicketDispatch,
      'assertBusAvailable strictly rejects bus with open ticket even when bus.status is ACTIVE',
    );
    assert(
      openTicketErrorMessage.includes(`Bus ${testBus2.plateNumber} cannot be dispatched: active maintenance work order in progress`),
      'Rejection error message explicitly identifies active maintenance work order and description',
    );

    // 3.4 Also rejects transactional trip assignment (assertAndAssignTrip)
    let caughtTransactionalAssignment = false;
    try {
      await assignmentIntegrityService.assertAndAssignTrip({
        routeId: testRoute.id,
        busId: testBus2.id,
        driverId: testDriver.id,
        adminId: adminUser.id,
      });
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtTransactionalAssignment = true;
      }
    }
    assert(
      caughtTransactionalAssignment,
      'assertAndAssignTrip transactionally blocks dispatch when open maintenance work order exists',
    );

    // 3.5 Dispatch also blocked when ticket is IN_PROGRESS
    await adminService.updateMaintenanceTicket(
      openTicket.id,
      { status: MaintenanceStatus.IN_PROGRESS, notes: 'Vehicle pulled onto inspection ramp' },
      adminUser.id,
    );

    let caughtInProgressTicketDispatch = false;
    try {
      await assignmentIntegrityService.assertBusAvailable(testBus2.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtInProgressTicketDispatch = true;
      }
    }
    assert(
      caughtInProgressTicketDispatch,
      'assertBusAvailable strictly rejects bus when ticket is IN_PROGRESS',
    );

    // =========================================================================
    // 4. AUTHORIZED RELEASE TO SERVICE
    // =========================================================================
    console.log('\n--- 4. Authorized Release to Service ---');

    // Set bus to MAINTENANCE status
    await prisma.bus.update({
      where: { id: testBus2.id },
      data: { status: BusStatus.MAINTENANCE, isActive: false },
    });

    // 4.1 Releasing bus with open ticket FAILS with 400
    let caughtPrematureRelease = false;
    let prematureReleaseMessage = '';
    try {
      await adminService.releaseBusToService(testBus2.id, adminUser.id);
    } catch (err: any) {
      if (err instanceof BadRequestException && err.getStatus() === 400) {
        caughtPrematureRelease = true;
        prematureReleaseMessage = err.message;
      }
    }
    assert(
      caughtPrematureRelease,
      'releaseBusToService strictly fails (400) when unresolved maintenance tickets exist',
    );
    assert(
      prematureReleaseMessage.includes('Cannot release bus: active maintenance work orders remain unresolved'),
      'Premature release error message precisely states active work orders remain unresolved',
    );

    // Verify bus status remained untouched
    const busStillMaint = await prisma.bus.findUnique({ where: { id: testBus2.id } });
    assert(
      busStillMaint?.status === BusStatus.MAINTENANCE && !busStillMaint?.isActive,
      'Bus status remains MAINTENANCE after rejected release attempt',
    );

    // 4.2 Resolve the open work order with full notes
    await adminService.updateMaintenanceTicket(
      openTicket.id,
      {
        status: MaintenanceStatus.RESOLVED,
        notes: 'Replaced oil pressure sender unit, tested circuit resistance, verified gauge operational',
      },
      adminUser.id,
    );

    // 4.3 Releasing bus now SUCCEEDS
    const releasedBus = await adminService.releaseBusToService(testBus2.id, adminUser.id);

    assert(
      releasedBus.status === BusStatus.ACTIVE && releasedBus.isActive === true,
      'releaseBusToService restores status = ACTIVE and isActive = true',
    );

    const busInDb = await prisma.bus.findUnique({ where: { id: testBus2.id } });
    assert(
      busInDb?.status === BusStatus.ACTIVE && busInDb?.isActive === true,
      'Bus status in database confirmed as ACTIVE and isActive = true',
    );

    const releaseAudit = await prisma.adminAudit.findFirst({
      where: { action: 'BUS_RELEASED_TO_SERVICE', targetId: testBus2.id },
    });
    assert(
      Boolean(releaseAudit) && releaseAudit?.adminId === adminUser.id,
      'AdminAudit logs BUS_RELEASED_TO_SERVICE upon authorized release',
    );

    // 4.4 Dispatch now succeeds after authorized release
    let dispatchAllowedAfterRelease = false;
    try {
      await assignmentIntegrityService.assertBusAvailable(testBus2.id);
      dispatchAllowedAfterRelease = true;
    } catch {
      dispatchAllowedAfterRelease = false;
    }
    assert(
      dispatchAllowedAfterRelease,
      'assertBusAvailable cleanly succeeds for released bus with all tickets RESOLVED',
    );

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n========================================================================');
    console.log(`📊 Total Assertions: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);
    console.log('========================================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL STEP 5 MAINTENANCE HARDENING ASSERTIONS PASSED CLEANLY!\n');
    } else {
      console.error('❌ SOME ASSERTIONS FAILED.');
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error('Fatal test error in maintenance hardening tests:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup test artifacts
    if (createdTripIds.length > 0) {
      await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } }).catch(() => {});
    }
    if (createdTicketIds.length > 0) {
      await prisma.adminAudit.deleteMany({ where: { targetId: { in: createdTicketIds } } }).catch(() => {});
      await prisma.busMaintenance.deleteMany({ where: { id: { in: createdTicketIds } } }).catch(() => {});
    }
    if (createdBusIds.length > 0) {
      await prisma.adminAudit.deleteMany({ where: { targetId: { in: createdBusIds } } }).catch(() => {});
      await prisma.bus.deleteMany({ where: { id: { in: createdBusIds } } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runMaintenanceHardeningTests();
