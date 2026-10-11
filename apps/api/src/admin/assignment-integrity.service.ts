import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { BusStatus, MaintenanceStatus, Prisma, Trip, TripStatus } from '@prisma/client';

export interface AssignTripParams {
  routeId: string;
  busId: string;
  driverId: string;
  adminId?: string;
  status?: TripStatus;
  startTime?: Date | string;
}

@Injectable()
export class AssignmentIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates that a driver exists, is active, and is not currently assigned to an ACTIVE or READY trip.
   * Throws ConflictException (409) if the driver has an overlapping active/ready trip.
   * Throws BadRequestException (400) if the driver is deactivated.
   * Throws NotFoundException (404) if the driver record does not exist.
   */
  async assertDriverAvailable(
    driverId: string,
    tx?: Prisma.TransactionClient,
    excludeTripId?: string,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const driver = await client.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID '${driverId}' not found.`);
    }

    if (!driver.isActive || !driver.active) {
      const identifier = driver.user?.email || driver.licenseNumber;
      throw new BadRequestException(
        `Driver '${identifier}' is deactivated and cannot be assigned to new trips.`,
      );
    }

    const conflictingTrip = await client.trip.findFirst({
      where: {
        driverId,
        status: { in: [TripStatus.ACTIVE, TripStatus.READY, TripStatus.SCHEDULED] },
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
      },
      include: {
        route: true,
        bus: true,
      },
    });

    if (conflictingTrip) {
      const identifier = driver.user?.email || driver.licenseNumber;
      const routeName = conflictingTrip.route?.name || conflictingTrip.routeId;
      throw new ConflictException(
        `Driver '${identifier}' is currently assigned to an ${conflictingTrip.status} trip (${conflictingTrip.id}) on route '${routeName}'. A driver cannot be assigned to concurrent trips.`,
      );
    }
  }

  /**
   * Validates that a bus exists, is active (not maintenance/inactive), and is not currently assigned to an ACTIVE, READY, or SCHEDULED trip,
   * nor has any open maintenance work orders.
   * Throws ConflictException (409) if the bus has an overlapping active/ready/scheduled trip.
   * Throws BadRequestException (400) if the bus is deactivated, under maintenance, or has an open work order.
   * Throws NotFoundException (404) if the bus record does not exist.
   */
  async assertBusAvailable(
    busId: string,
    tx?: Prisma.TransactionClient,
    excludeTripId?: string,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const bus = await client.bus.findUnique({
      where: { id: busId },
    });

    if (!bus) {
      throw new NotFoundException(`Bus with ID '${busId}' not found.`);
    }

    if (!bus.isActive || bus.status === BusStatus.INACTIVE || bus.status === BusStatus.MAINTENANCE) {
      throw new BadRequestException(
        `Bus '${bus.plateNumber}' is not operational (status: ${bus.status}, isActive: ${bus.isActive}) and cannot be assigned to trips.`,
      );
    }

    const activeTicket = await client.busMaintenance.findFirst({
      where: {
        busId,
        status: { in: [MaintenanceStatus.REPORTED, MaintenanceStatus.IN_PROGRESS] },
      },
    });

    if (activeTicket) {
      throw new BadRequestException(
        `Bus ${bus.plateNumber} cannot be dispatched: active maintenance work order in progress (${activeTicket.category}: ${activeTicket.description})`,
      );
    }


    const conflictingTrip = await client.trip.findFirst({
      where: {
        busId,
        status: { in: [TripStatus.ACTIVE, TripStatus.READY, TripStatus.SCHEDULED] },
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
      },
      include: {
        route: true,
      },
    });

    if (conflictingTrip) {
      const routeName = conflictingTrip.route?.name || conflictingTrip.routeId;
      throw new ConflictException(
        `Bus '${bus.plateNumber}' is currently assigned to an ${conflictingTrip.status} trip (${conflictingTrip.id}) on route '${routeName}'. A vehicle cannot be assigned to concurrent trips.`,
      );
    }
  }

  /**
   * Deactivation Safety Guard for Bus:
   * Prevents setting isActive: false (or decommissioning) on a Bus if it is currently tied to an ACTIVE trip.
   * Throws BadRequestException (400) if violated.
   */
  async assertBusCanDeactivate(
    busId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const bus = await client.bus.findUnique({
      where: { id: busId },
    });

    if (!bus) {
      throw new NotFoundException(`Bus with ID '${busId}' not found.`);
    }

    const activeTrip = await client.trip.findFirst({
      where: {
        busId,
        status: TripStatus.ACTIVE,
      },
      include: {
        route: true,
      },
    });

    if (activeTrip) {
      const routeName = activeTrip.route?.name || activeTrip.routeId;
      throw new BadRequestException(
        `Cannot deactivate Bus '${bus.plateNumber}'. It is currently operating an ACTIVE trip (${activeTrip.id}) on route '${routeName}'. Conclude or terminate the active trip before deactivating this vehicle.`,
      );
    }
  }

  /**
   * Deactivation Safety Guard for Driver:
   * Prevents setting isActive: false on a Driver if they are currently tied to an ACTIVE trip.
   * Throws BadRequestException (400) if violated.
   */
  async assertDriverCanDeactivate(
    driverId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const driver = await client.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID '${driverId}' not found.`);
    }

    const activeTrip = await client.trip.findFirst({
      where: {
        driverId,
        status: TripStatus.ACTIVE,
      },
      include: {
        route: true,
      },
    });

    if (activeTrip) {
      const identifier = driver.user?.email || driver.licenseNumber;
      const routeName = activeTrip.route?.name || activeTrip.routeId;
      throw new BadRequestException(
        `Cannot deactivate Driver '${identifier}'. The driver is currently operating an ACTIVE trip (${activeTrip.id}) on route '${routeName}'. Conclude or terminate the active trip before deactivating this driver.`,
      );
    }
  }

  /**
   * Atomic Assignment Wrapper:
   * Executes route check, driver availability check, bus availability check, trip creation,
   * and optional admin audit logging inside a Prisma transaction with transaction-scoped
   * advisory locks to guarantee isolation and prevent race conditions during concurrent
   * admin dispatch requests.
   */
  async assertAndAssignTrip(
    params: AssignTripParams,
    existingTx?: Prisma.TransactionClient,
  ): Promise<Trip> {
    const execute = async (tx: Prisma.TransactionClient): Promise<Trip> => {
      // 0. Acquire transaction-scoped advisory locks for both target bus and driver before executing availability queries
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('assign_bus:' || ${params.busId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('assign_driver:' || ${params.driverId}))`;

      // 1. Route validation
      const route = await tx.route.findUnique({
        where: { id: params.routeId },
      });

      if (!route) {
        throw new NotFoundException(`Route with ID '${params.routeId}' not found.`);
      }

      if (!route.active) {
        throw new BadRequestException(
          `Route '${route.name}' is inactive and cannot accept new scheduled trips.`,
        );
      }

      // 2. Transactional Bus Conflict & Availability Check
      await this.assertBusAvailable(params.busId, tx);

      // 3. Transactional Driver Conflict & Availability Check
      await this.assertDriverAvailable(params.driverId, tx);

      // 4. Atomic Trip Creation
      const startTimeDate = params.startTime
        ? typeof params.startTime === 'string'
          ? new Date(params.startTime)
          : params.startTime
        : null;

      const trip = await tx.trip.create({
        data: {
          routeId: params.routeId,
          busId: params.busId,
          driverId: params.driverId,
          status: params.status ?? TripStatus.SCHEDULED,
          startTime: startTimeDate,
        },
        include: {
          bus: true,
          driver: {
            include: { user: true },
          },
          route: true,
        },
      });

      // 5. Atomic Admin Audit Log (if adminId provided)
      if (params.adminId) {
        await tx.adminAudit.create({
          data: {
            adminId: params.adminId,
            action: 'TRIP_SCHEDULED',
            targetType: 'TRIP',
            targetId: trip.id,
            metadata: {
              routeId: trip.routeId,
              routeName: route.name,
              busId: trip.busId,
              plateNumber: trip.bus.plateNumber,
              driverId: trip.driverId,
              driverEmail: trip.driver.user.email,
              status: trip.status,
            },
          },
        });
      }

      return trip;
    };

    if (existingTx) {
      return execute(existingTx);
    }

    return this.prisma.$transaction(
      async (tx) => {
        return execute(tx);
      },
      { maxWait: 20000, timeout: 30000 },
    );
  }
}
