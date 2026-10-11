import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import {
  AdminAudit,
  BusStatus,
  MaintenanceCategory,
  MaintenanceStatus,
  Prisma,
  Role,
  TripStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { TripsGateway } from '../trips/trips.gateway';
import { GeofenceService } from '../trips/geofence.service';
import { RouteProgressService } from '../trips/route-progress.service';
import { evaluateTelemetryFreshness } from '../common/utils/eta.util';
import { clampPagination, buildPaginatedResponse } from '../common/utils/pagination.util';
import {
  CreateBusDto,
  CreateDriverDto,
  CreateMaintenanceDto,
  UpdateBusDto,
  UpdateDriverDto,
  UpdateMaintenanceDto,
} from './dto/admin.dto';

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /auth(orization)?/i,
  /credential/i,
  /key$/i,
  /hash/i,
  /cookie/i,
];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentIntegrityService: AssignmentIntegrityService,
    private readonly tripsGateway?: TripsGateway,
    private readonly geofenceService?: GeofenceService,
    private readonly routeProgressService?: RouteProgressService,
  ) {}

  /**
   * Recursively sanitizes metadata by redacting passwords, tokens, and raw secrets.
   */
  sanitizeMetadata(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeMetadata(item));
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (value !== null && typeof value === 'object') {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Reusable method to log administrative actions into AdminAudit.
   * Sanitizes all metadata payloads prior to database persistence.
   */
  async logAction(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>,
    tx?: Prisma.TransactionClient,
  ): Promise<AdminAudit> {
    const client = tx ?? this.prisma;

    const sanitizedMetadata = metadata
      ? (this.sanitizeMetadata(metadata) as Prisma.InputJsonValue)
      : undefined;

    return client.adminAudit.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        metadata: sanitizedMetadata,
      },
    });
  }

  /**
   * Retrieves paginated admin audit logs with optional filtering.
   */
  async getAuditLogs(params?: {
    targetType?: string;
    targetId?: string;
    adminId?: string;
    limit?: number | string;
    offset?: number | string;
    page?: number | string;
    skip?: number | string;
  }) {
    const clamped = clampPagination(params);
    const { targetType, targetId, adminId } = params || {};

    const where: Prisma.AdminAuditWhereInput = {
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
      ...(adminId ? { adminId } : {}),
    };

    const [total, logs] = await Promise.all([
      this.prisma.adminAudit.count({ where }),
      this.prisma.adminAudit.findMany({
        where,
        take: clamped.limit,
        skip: clamped.skip,
        orderBy: { timestamp: 'desc' },
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(logs, total, clamped);
  }

  // =========================================================================
  // 1. FLEET (BUS) MANAGEMENT
  // =========================================================================

  /**
   * GET /admin/buses
   * Retrieves buses with filtering, pagination, active trip, assigned driver, and maintenance count.
   */
  async getBuses(query?: {
    search?: string;
    status?: BusStatus;
    page?: number | string;
    limit?: number | string;
    skip?: number | string;
    offset?: number | string;
  }) {
    const clamped = clampPagination(query);
    const { search, status } = query || {};

    const where: Prisma.BusWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { plateNumber: { contains: search, mode: 'insensitive' } },
              { model: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, buses] = await Promise.all([
      this.prisma.bus.count({ where }),
      this.prisma.bus.findMany({
        where,
        take: clamped.limit,
        skip: clamped.skip,
        orderBy: { createdAt: 'desc' },
        include: {
          trips: {
            where: { status: TripStatus.ACTIVE },
            take: 1,
            include: {
              route: { select: { id: true, name: true } },
              driver: {
                select: {
                  id: true,
                  name: true,
                  licenseNumber: true,
                  phone: true,
                  user: { select: { email: true } },
                },
              },
            },
          },
          _count: {
            select: {
              maintenances: true,
            },
          },
        },
      }),
    ]);

    const formatted = buses.map((bus) => {
      const activeTrip = bus.trips[0] || null;
      return {
        id: bus.id,
        plateNumber: bus.plateNumber,
        capacity: bus.capacity,
        model: bus.model,
        status: bus.status,
        isActive: bus.isActive,
        createdAt: bus.createdAt,
        updatedAt: bus.updatedAt,
        activeTrip: activeTrip
          ? {
              id: activeTrip.id,
              routeId: activeTrip.routeId,
              routeName: activeTrip.route.name,
              startTime: activeTrip.startTime,
            }
          : null,
        assignedDriver: activeTrip?.driver
          ? {
              id: activeTrip.driver.id,
              name: activeTrip.driver.name,
              licenseNumber: activeTrip.driver.licenseNumber,
              phone: activeTrip.driver.phone,
              email: activeTrip.driver.user.email,
            }
          : null,
        maintenanceCount: bus._count.maintenances,
      };
    });

    return buildPaginatedResponse(formatted, total, clamped);
  }

  /**
   * POST /admin/buses
   * Creates a new bus with unique plateNumber validation and capacity > 0.
   * Logs BUS_CREATED in AdminAudit.
   */
  async createBus(dto: CreateBusDto, adminId: string) {
    if (dto.capacity <= 0) {
      throw new BadRequestException('Bus capacity must be strictly greater than 0.');
    }

    const existing = await this.prisma.bus.findUnique({
      where: { plateNumber: dto.plateNumber.trim() },
    });

    if (existing) {
      throw new ConflictException(
        `Bus with plate number '${dto.plateNumber.trim()}' already exists.`,
      );
    }

    const bus = await this.prisma.bus.create({
      data: {
        plateNumber: dto.plateNumber.trim(),
        capacity: dto.capacity,
        model: dto.model?.trim() ?? null,
        status: dto.status ?? BusStatus.ACTIVE,
        isActive: dto.isActive ?? true,
      },
    });

    await this.logAction(adminId, 'BUS_CREATED', 'BUS', bus.id, {
      plateNumber: bus.plateNumber,
      capacity: bus.capacity,
      model: bus.model,
      status: bus.status,
      isActive: bus.isActive,
    });

    return bus;
  }

  /**
   * PATCH /admin/buses/:id
   * Updates bus capacity, model, status, and isActive.
   * Guards against deactivating vehicles on active trips.
   * Logs BUS_UPDATED in AdminAudit.
   */
  async updateBus(busId: string, dto: UpdateBusDto, adminId: string) {
    const bus = await this.prisma.bus.findUnique({ where: { id: busId } });
    if (!bus) {
      throw new NotFoundException(`Bus with ID '${busId}' not found.`);
    }

    if (dto.capacity !== undefined && dto.capacity <= 0) {
      throw new BadRequestException('Bus capacity must be strictly greater than 0.');
    }

    if (dto.plateNumber && dto.plateNumber.trim() !== bus.plateNumber) {
      const duplicate = await this.prisma.bus.findUnique({
        where: { plateNumber: dto.plateNumber.trim() },
      });
      if (duplicate) {
        throw new ConflictException(
          `Bus with plate number '${dto.plateNumber.trim()}' already exists.`,
        );
      }
    }

    const willDeactivate =
      (dto.isActive !== undefined && !dto.isActive) ||
      dto.status === BusStatus.INACTIVE ||
      dto.status === BusStatus.MAINTENANCE;

    if (willDeactivate && (bus.isActive || bus.status === BusStatus.ACTIVE)) {
      await this.assignmentIntegrityService.assertBusCanDeactivate(busId);
    }

    const updated = await this.prisma.bus.update({
      where: { id: busId },
      data: {
        ...(dto.plateNumber ? { plateNumber: dto.plateNumber.trim() } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.model !== undefined ? { model: dto.model?.trim() ?? null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.logAction(adminId, 'BUS_UPDATED', 'BUS', busId, {
      previous: {
        plateNumber: bus.plateNumber,
        capacity: bus.capacity,
        model: bus.model,
        status: bus.status,
        isActive: bus.isActive,
      },
      updated: {
        plateNumber: updated.plateNumber,
        capacity: updated.capacity,
        model: updated.model,
        status: updated.status,
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  /**
   * Safely updates a bus's active status with conflict checks and admin audit logging.
   */
  async setBusActive(busId: string, isActive: boolean, adminId?: string) {
    if (!isActive) {
      await this.assignmentIntegrityService.assertBusCanDeactivate(busId);
    }

    return this.prisma.$transaction(async (tx) => {
      const bus = await tx.bus.findUnique({ where: { id: busId } });
      if (!bus) {
        throw new NotFoundException(`Bus with ID '${busId}' not found.`);
      }

      const updated = await tx.bus.update({
        where: { id: busId },
        data: {
          isActive,
          status: isActive ? BusStatus.ACTIVE : BusStatus.INACTIVE,
        },
      });

      if (adminId) {
        await this.logAction(
          adminId,
          isActive ? 'BUS_ACTIVATED' : 'BUS_DEACTIVATED',
          'BUS',
          busId,
          {
            plateNumber: bus.plateNumber,
            previousStatus: bus.status,
            newStatus: updated.status,
          },
          tx,
        );
      }

      return updated;
    });
  }

  // =========================================================================
  // 2. DRIVER MANAGEMENT
  // =========================================================================

  /**
   * GET /admin/drivers
   * Retrieves drivers with search, pagination, active trip, assigned bus, and status.
   * Strictly suppresses password hashes, refresh tokens, and raw secrets.
   */
  async getDrivers(query?: {
    search?: string;
    page?: number | string;
    limit?: number | string;
    skip?: number | string;
    offset?: number | string;
  }) {
    const clamped = clampPagination(query);
    const { search } = query || {};

    const where: Prisma.DriverWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { licenseNumber: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [total, drivers] = await Promise.all([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({
        where,
        take: clamped.limit,
        skip: clamped.skip,
        orderBy: { user: { createdAt: 'desc' } },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              active: true,
              createdAt: true,
            },
          },
          trips: {
            where: { status: TripStatus.ACTIVE },
            take: 1,
            include: {
              route: { select: { id: true, name: true } },
              bus: {
                select: {
                  id: true,
                  plateNumber: true,
                  model: true,
                  status: true,
                  capacity: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formatted = drivers.map((driver) => {
      const activeTrip = driver.trips[0] || null;
      return {
        id: driver.id,
        userId: driver.userId,
        name: driver.name,
        email: driver.user.email,
        licenseNumber: driver.licenseNumber,
        phone: driver.phone,
        active: driver.active,
        isActive: driver.isActive,
        createdAt: driver.user.createdAt,
        activeTrip: activeTrip
          ? {
              id: activeTrip.id,
              routeId: activeTrip.routeId,
              routeName: activeTrip.route.name,
              startTime: activeTrip.startTime,
            }
          : null,
        assignedBus: activeTrip?.bus || null,
      };
    });

    return buildPaginatedResponse(formatted, total, clamped);
  }

  /**
   * POST /admin/drivers
   * Creates driver record linked to user authentication.
   * Logs DRIVER_CREATED in AdminAudit with sanitized metadata.
   */
  async createDriver(dto: CreateDriverDto, adminId: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException(`User with email '${dto.email.trim()}' already exists.`);
    }

    const existingLicense = await this.prisma.driver.findUnique({
      where: { licenseNumber: dto.licenseNumber.trim() },
    });
    if (existingLicense) {
      throw new ConflictException(
        `Driver with license number '${dto.licenseNumber.trim()}' already exists.`,
      );
    }

    const rawPassword = dto.password || 'Driver@BTS2026';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const driver = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          role: Role.DRIVER,
          passwordHash,
          active: true,
        },
      });

      const newDriver = await tx.driver.create({
        data: {
          userId: user.id,
          name: dto.name?.trim() ?? null,
          licenseNumber: dto.licenseNumber.trim(),
          phone: dto.phone?.trim() ?? null,
          active: true,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              createdAt: true,
            },
          },
        },
      });

      return newDriver;
    });

    await this.logAction(adminId, 'DRIVER_CREATED', 'DRIVER', driver.id, {
      driverId: driver.id,
      userId: driver.userId,
      email: driver.user.email,
      name: driver.name,
      licenseNumber: driver.licenseNumber,
      phone: driver.phone,
    });

    return driver;
  }

  /**
   * PATCH /admin/drivers/:id
   * Updates driver metadata (name, licenseNumber, phone, isActive).
   * Logs DRIVER_UPDATED in AdminAudit.
   */
  async updateDriver(driverId: string, dto: UpdateDriverDto, adminId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID '${driverId}' not found.`);
    }

    if (dto.licenseNumber && dto.licenseNumber.trim() !== driver.licenseNumber) {
      const duplicate = await this.prisma.driver.findUnique({
        where: { licenseNumber: dto.licenseNumber.trim() },
      });
      if (duplicate) {
        throw new ConflictException(
          `Driver with license number '${dto.licenseNumber.trim()}' already exists.`,
        );
      }
    }

    if (dto.isActive !== undefined && !dto.isActive && driver.isActive) {
      await this.assignmentIntegrityService.assertDriverCanDeactivate(driverId);
    }

    const updated = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name?.trim() ?? null } : {}),
        ...(dto.licenseNumber ? { licenseNumber: dto.licenseNumber.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() ?? null } : {}),
        ...(dto.isActive !== undefined
          ? { isActive: dto.isActive, active: dto.isActive }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    await this.logAction(adminId, 'DRIVER_UPDATED', 'DRIVER', driverId, {
      previous: {
        name: driver.name,
        licenseNumber: driver.licenseNumber,
        phone: driver.phone,
        isActive: driver.isActive,
      },
      updated: {
        name: updated.name,
        licenseNumber: updated.licenseNumber,
        phone: updated.phone,
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  /**
   * Safely updates a driver's active status with conflict checks and admin audit logging.
   */
  async setDriverActive(driverId: string, isActive: boolean, adminId?: string) {
    if (!isActive) {
      await this.assignmentIntegrityService.assertDriverCanDeactivate(driverId);
    }

    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        include: { user: true },
      });

      if (!driver) {
        throw new NotFoundException(`Driver with ID '${driverId}' not found.`);
      }

      const updated = await tx.driver.update({
        where: { id: driverId },
        data: {
          isActive,
          active: isActive,
        },
      });

      if (adminId) {
        await this.logAction(
          adminId,
          isActive ? 'DRIVER_ACTIVATED' : 'DRIVER_DEACTIVATED',
          'DRIVER',
          driverId,
          {
            licenseNumber: driver.licenseNumber,
            driverEmail: driver.user?.email,
          },
          tx,
        );
      }

      return updated;
    });
  }

  // =========================================================================
  // 3. TRIP OPERATIONS & FLEET TELEMETRY
  // =========================================================================

  /**
   * GET /admin/trips
   * Retrieves trips with status filter, telemetry freshness, and occupancy percentage.
   */
  async getTrips(query?: {
    status?: TripStatus;
    routeId?: string;
    busId?: string;
    driverId?: string;
    page?: number | string;
    limit?: number | string;
    skip?: number | string;
    offset?: number | string;
  }) {
    const clamped = clampPagination(query);
    const { status, routeId, busId, driverId } = query || {};

    const where: Prisma.TripWhereInput = {
      ...(status ? { status } : {}),
      ...(routeId ? { routeId } : {}),
      ...(busId ? { busId } : {}),
      ...(driverId ? { driverId } : {}),
    };

    const [total, trips] = await Promise.all([
      this.prisma.trip.count({ where }),
      this.prisma.trip.findMany({
        where,
        take: clamped.limit,
        skip: clamped.skip,
        orderBy: { createdAt: 'desc' },
        include: {
          bus: {
            select: {
              id: true,
              plateNumber: true,
              capacity: true,
              model: true,
              status: true,
            },
          },
          driver: {
            select: {
              id: true,
              name: true,
              licenseNumber: true,
              phone: true,
              user: { select: { email: true } },
            },
          },
          route: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          locationHistory: {
            take: 1,
            orderBy: { recordedAt: 'desc' },
            select: {
              latitude: true,
              longitude: true,
              speed: true,
              heading: true,
              recordedAt: true,
            },
          },
          boardings: {
            select: {
              type: true,
            },
          },
        },
      }),
    ]);

    const now = Date.now();

    const formatted = trips.map((trip) => {
      const latestLocation = trip.locationHistory[0] || null;
      let telemetryFreshnessSeconds: number | null = null;
      let telemetryStatus: 'ACTIVE' | 'STALE' | 'OFFLINE' | 'N/A' = 'N/A';
      let freshness: 'LIVE' | 'STALE' | 'OFFLINE' | 'N/A' = 'N/A';
      let isStale: boolean = false;

      if (trip.status === TripStatus.ACTIVE) {
        const evaluation = evaluateTelemetryFreshness(latestLocation?.recordedAt, now);
        telemetryFreshnessSeconds = evaluation.ageSeconds;
        telemetryStatus = evaluation.status;
        freshness = evaluation.freshness;
        isStale = evaluation.isStale;
      }

      const boardCount = trip.boardings.filter((b) => b.type === 'BOARD').length;
      const dropCount = trip.boardings.filter((b) => b.type === 'DROP').length;
      const currentOccupancy = Math.max(0, boardCount - dropCount);
      const occupancyPercentage = trip.bus.capacity
        ? Math.min(100, Math.round((currentOccupancy / trip.bus.capacity) * 100))
        : 0;

      return {
        id: trip.id,
        status: trip.status,
        startTime: trip.startTime,
        endTime: trip.endTime,
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt,
        route: trip.route,
        bus: trip.bus,
        driver: {
          id: trip.driver.id,
          name: trip.driver.name,
          licenseNumber: trip.driver.licenseNumber,
          phone: trip.driver.phone,
          email: trip.driver.user.email,
        },
        telemetry: {
          latestLocation,
          freshnessSeconds: telemetryFreshnessSeconds,
          status: telemetryStatus,
          freshness,
          isStale,
        },
        occupancy: {
          current: currentOccupancy,
          capacity: trip.bus.capacity,
          percentage: occupancyPercentage,
        },
      };
    });

    return buildPaginatedResponse(formatted, total, clamped);
  }

  /**
   * POST /admin/trips/:id/cancel
   * Cancels a SCHEDULED, READY, or emergency aborts an ACTIVE trip.
   * Resets active geofence & route tracking caches.
   * Emits trip:cancelled via WebSockets.
   * Logs TRIP_CANCELLED in AdminAudit with reason.
   */
  async cancelTrip(tripId: string, adminId: string, reason?: string) {
    const trimmedReason = reason?.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      throw new BadRequestException(
        'Cancellation reason must be provided and be at least 5 characters long.',
      );
    }

    const { updated, wasActive, isIdempotent } = await this.prisma.$transaction(
      async (tx) => {
        const trip = await tx.trip.findUnique({
          where: { id: tripId },
          include: {
            bus: true,
            driver: { include: { user: true } },
            route: true,
          },
        });

        if (!trip) {
          throw new NotFoundException(`Trip with ID '${tripId}' not found.`);
        }

        // If the trip is already CANCELLED, return the trip idempotently without logging duplicate audit entries
        if (trip.status === TripStatus.CANCELLED) {
          return { updated: trip, wasActive: false, isIdempotent: true };
        }

        // If the trip is already COMPLETED, reject cancellation with BadRequestException (400)
        if (trip.status === TripStatus.COMPLETED) {
          throw new BadRequestException('Cannot cancel a completed trip.');
        }

        const wasActive = trip.status === TripStatus.ACTIVE;
        const previousStatus = trip.status;

        const updatedTrip = await tx.trip.update({
          where: { id: tripId },
          data: {
            status: TripStatus.CANCELLED,
            endTime: trip.endTime || new Date(),
          },
          include: {
            bus: true,
            driver: { include: { user: true } },
            route: true,
          },
        });

        await this.logAction(
          adminId,
          'TRIP_CANCELLED',
          'TRIP',
          trip.id,
          {
            previousStatus,
            newStatus: TripStatus.CANCELLED,
            reason: trimmedReason,
            cancelledAt: (updatedTrip.endTime || new Date()).toISOString(),
            routeId: trip.routeId,
            routeName: trip.route.name,
            busId: trip.busId,
            plateNumber: trip.bus.plateNumber,
            driverId: trip.driverId,
            driverEmail: trip.driver.user?.email,
          },
          tx,
        );

        return { updated: updatedTrip, wasActive, isIdempotent: false };
      },
    );

    if (isIdempotent) {
      return updated;
    }

    if (wasActive) {
      this.geofenceService?.clearTripGeofenceState(updated.id);
      this.routeProgressService?.clearTripState(updated.id);
    }

    this.tripsGateway?.broadcastTripCancelled(updated.id, {
      tripId: updated.id,
      status: TripStatus.CANCELLED,
      cancelledAt: (updated.endTime || new Date()).toISOString(),
      reason: trimmedReason,
      busId: updated.busId,
      plateNumber: updated.bus.plateNumber,
    });

    return updated;
  }

  /**
   * GET /admin/fleet/status
   * Aggregates fleet-wide operational telemetry metrics:
   * Counts by trip status, telemetry freshness buckets (ACTIVE, STALE, OFFLINE),
   * total buses, active buses, and unacknowledged SOS alert count.
   */
  async getFleetStatus() {
    const [
      activeTrips,
      scheduledCount,
      readyCount,
      completedCount,
      cancelledCount,
      totalBuses,
      activeBuses,
      unacknowledgedSosCount,
    ] = await Promise.all([
      this.prisma.trip.findMany({
        where: { status: TripStatus.ACTIVE },
        select: {
          id: true,
          locationHistory: {
            take: 1,
            orderBy: { recordedAt: 'desc' },
            select: { recordedAt: true },
          },
        },
      }),
      this.prisma.trip.count({ where: { status: TripStatus.SCHEDULED } }),
      this.prisma.trip.count({ where: { status: TripStatus.READY } }),
      this.prisma.trip.count({ where: { status: TripStatus.COMPLETED } }),
      this.prisma.trip.count({ where: { status: TripStatus.CANCELLED } }),
      this.prisma.bus.count(),
      this.prisma.bus.count({
        where: { isActive: true, status: BusStatus.ACTIVE },
      }),
      this.prisma.tripAudit.count({
        where: {
          action: 'SOS',
          acknowledgedAt: null,
        },
      }),
    ]);

    const now = Date.now();
    let freshActiveCount = 0;
    let staleCount = 0;
    let offlineCount = 0;

    for (const trip of activeTrips) {
      const latest = trip.locationHistory[0];
      const evaluation = evaluateTelemetryFreshness(latest?.recordedAt, now);
      if (evaluation.tier === 'LIVE') {
        freshActiveCount++;
      } else if (evaluation.tier === 'STALE') {
        staleCount++;
      } else {
        offlineCount++;
      }
    }

    return {
      trips: {
        active: activeTrips.length,
        scheduled: scheduledCount,
        ready: readyCount,
        completed: completedCount,
        cancelled: cancelledCount,
        total:
          activeTrips.length +
          scheduledCount +
          readyCount +
          completedCount +
          cancelledCount,
      },
      telemetry: {
        active: freshActiveCount,
        live: freshActiveCount,
        stale: staleCount,
        offline: offlineCount,
        totalActiveTrips: activeTrips.length,
      },
      fleet: {
        totalBuses,
        activeBuses,
        inactiveOrMaintenanceBuses: Math.max(0, totalBuses - activeBuses),
      },
      safety: {
        unacknowledgedSosCount,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // =========================================================================
  // 4. SOS & SAFETY MONITORING
  // =========================================================================

  /**
   * GET /admin/sos
   * Fetches all TripAudit records where action = 'SOS'.
   * Includes trip, driver, bus, last known GPS, acknowledgement and resolution status.
   */
  async getSosAlerts(query?: {
    status?: 'all' | 'unacknowledged' | 'unresolved';
    page?: number | string;
    limit?: number | string;
    skip?: number | string;
    offset?: number | string;
  }) {
    const clamped = clampPagination(query);
    const { status = 'all' } = query || {};

    const where: Prisma.TripAuditWhereInput = {
      action: 'SOS',
      ...(status === 'unacknowledged' ? { acknowledgedAt: null } : {}),
      ...(status === 'unresolved' ? { resolvedAt: null } : {}),
    };

    const [total, alerts] = await Promise.all([
      this.prisma.tripAudit.count({ where }),
      this.prisma.tripAudit.findMany({
        where,
        take: clamped.limit,
        skip: clamped.skip,
        orderBy: { timestamp: 'desc' },
        include: {
          trip: {
            include: {
              bus: { select: { id: true, plateNumber: true, model: true } },
              route: { select: { id: true, name: true } },
            },
          },
          driver: {
            include: {
              user: { select: { id: true, email: true } },
            },
          },
        },
      }),
    ]);

    const formatted = alerts.map((alert) => {
      const meta = (alert.metadata as any) || {};
      return {
        id: alert.id,
        tripId: alert.tripId,
        driverId: alert.driverId,
        timestamp: alert.timestamp,
        acknowledgedAt: alert.acknowledgedAt,
        acknowledgedBy: alert.acknowledgedBy,
        isAcknowledged: Boolean(alert.acknowledgedAt),
        resolvedAt: alert.resolvedAt,
        resolutionNotes: alert.resolutionNotes,
        isResolved: Boolean(alert.resolvedAt),
        lastKnownGps: meta.lastKnownGps || null,
        route: alert.trip?.route || null,
        bus: alert.trip?.bus || null,
        driver: {
          id: alert.driver.id,
          name: alert.driver.name,
          licenseNumber: alert.driver.licenseNumber,
          phone: alert.driver.phone,
          email: alert.driver.user.email,
        },
        metadata: alert.metadata,
      };
    });

    return buildPaginatedResponse(formatted, total, clamped);
  }

  /**
   * POST /admin/sos/:id/acknowledge
   * Sets acknowledgedAt = now() and acknowledgedBy = adminId.
   * If already acknowledged or resolved, returns existing record idempotently without logging duplicate audits.
   * Logs SOS_ACKNOWLEDGED in AdminAudit.
   */
  async acknowledgeSos(sosAuditId: string, adminId: string) {
    const alert = await this.prisma.tripAudit.findFirst({
      where: { id: sosAuditId, action: 'SOS' },
    });

    if (!alert) {
      throw new NotFoundException(`Emergency SOS alert '${sosAuditId}' not found.`);
    }

    // Idempotency guard: If already acknowledged or already resolved, return existing alert cleanly
    if (alert.acknowledgedAt || alert.resolvedAt) {
      return {
        success: true,
        message: 'SOS alert already acknowledged or resolved.',
        alert,
      };
    }

    const updated = await this.prisma.tripAudit.update({
      where: { id: sosAuditId },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: adminId,
      },
    });

    await this.logAction(adminId, 'SOS_ACKNOWLEDGED', 'SOS', sosAuditId, {
      tripId: updated.tripId,
      driverId: updated.driverId,
      acknowledgedAt: updated.acknowledgedAt,
      acknowledgedBy: adminId,
    });

    return {
      success: true,
      message: 'SOS alert acknowledged successfully.',
      alert: updated,
    };
  }

  /**
   * POST /admin/sos/:id/resolve
   * Resolves an emergency SOS alert.
   * Validates non-empty resolutionNotes of at least 5 characters.
   * Rejects already resolved alerts with 409 ConflictException.
   * Atomically stamps acknowledgedAt/acknowledgedBy if not yet acknowledged.
   * Preserves all original evidence (metadata, coordinates, trip/driver IDs).
   * Logs SOS_RESOLVED in AdminAudit.
   */
  async resolveSos(
    sosAuditId: string,
    dtoOrAdminId: { resolutionNotes: string } | string,
    adminIdOrNotes?: string,
  ) {
    let adminId: string;
    let rawNotes: string | undefined;

    if (typeof dtoOrAdminId === 'object' && dtoOrAdminId !== null) {
      rawNotes = dtoOrAdminId.resolutionNotes;
      adminId = adminIdOrNotes || 'system';
    } else {
      adminId = dtoOrAdminId;
      rawNotes = adminIdOrNotes;
    }

    const trimmedNotes = rawNotes ? rawNotes.trim() : '';
    if (!trimmedNotes || trimmedNotes.length < 5) {
      throw new BadRequestException(
        'resolutionNotes must be a non-empty string of at least 5 characters.',
      );
    }

    const alert = await this.prisma.tripAudit.findFirst({
      where: { id: sosAuditId, action: 'SOS' },
    });

    if (!alert) {
      throw new NotFoundException(`Emergency SOS alert '${sosAuditId}' not found.`);
    }

    // State lock: Reject resolving an already resolved alert with 409 ConflictException
    if (alert.resolvedAt) {
      throw new ConflictException(
        `Emergency SOS alert '${sosAuditId}' is already resolved and locked against further modification.`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.tripAudit.update({
      where: { id: sosAuditId },
      data: {
        resolvedAt: now,
        resolutionNotes: trimmedNotes,
        acknowledgedAt: alert.acknowledgedAt ?? now,
        acknowledgedBy: alert.acknowledgedBy ?? adminId,
      },
    });

    await this.logAction(adminId, 'SOS_RESOLVED', 'SOS', sosAuditId, {
      tripId: updated.tripId,
      driverId: updated.driverId,
      resolvedAt: updated.resolvedAt,
      resolutionNotes: updated.resolutionNotes,
      acknowledgedAt: updated.acknowledgedAt,
      acknowledgedBy: updated.acknowledgedBy,
    });

    return {
      success: true,
      message: 'SOS alert resolved successfully.',
      alert: updated,
    };
  }

  // =========================================================================
  // 5. MAINTENANCE FOUNDATION
  // =========================================================================

  /**
   * GET /admin/maintenance
   * Filters maintenance records by busId and status.
   */
  async getMaintenanceTickets(query?: {
    busId?: string;
    status?: MaintenanceStatus;
    category?: MaintenanceCategory;
    page?: number | string;
    limit?: number | string;
    skip?: number | string;
    offset?: number | string;
  }) {
    const clamped = clampPagination(query);
    const { busId, status, category } = query || {};

    const where: Prisma.BusMaintenanceWhereInput = {
      ...(busId ? { busId } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    };

    const [total, tickets] = await Promise.all([
      this.prisma.busMaintenance.count({ where }),
      this.prisma.busMaintenance.findMany({
        where,
        take: clamped.limit,
        skip: clamped.skip,
        orderBy: { reportedAt: 'desc' },
        include: {
          bus: {
            select: {
              id: true,
              plateNumber: true,
              model: true,
              status: true,
              isActive: true,
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(tickets, total, clamped);
  }

  /**
   * POST /admin/maintenance
   * Creates a maintenance ticket (busId, category, description, notes, dueDate).
   * Records reportedById: adminId. Sets status to REPORTED.
   * Logs MAINTENANCE_CREATED in AdminAudit.
   */
  async createMaintenanceTicket(dto: CreateMaintenanceDto, adminId: string) {
    const bus = await this.prisma.bus.findUnique({
      where: { id: dto.busId },
    });

    if (!bus) {
      throw new NotFoundException(`Bus with ID '${dto.busId}' not found.`);
    }

    const ticket = await this.prisma.busMaintenance.create({
      data: {
        busId: dto.busId,
        category: dto.category,
        description: dto.description.trim(),
        notes: dto.notes?.trim() ?? null,
        status: MaintenanceStatus.REPORTED,
        reportedById: adminId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
      include: {
        bus: {
          select: {
            id: true,
            plateNumber: true,
            model: true,
            status: true,
          },
        },
      },
    });

    await this.logAction(adminId, 'MAINTENANCE_CREATED', 'MAINTENANCE', ticket.id, {
      ticketId: ticket.id,
      busId: ticket.busId,
      plateNumber: bus.plateNumber,
      category: ticket.category,
      description: ticket.description,
      status: ticket.status,
      reportedById: adminId,
    });

    return ticket;
  }

  /**
   * PATCH /admin/maintenance/:id
   * Updates maintenance status, notes, and resolution.
   * Enforces linear state transitions:
   *   REPORTED -> IN_PROGRESS
   *   IN_PROGRESS -> RESOLVED
   *   REPORTED -> RESOLVED
   * Disallows modifications on already RESOLVED tickets or backwards transitions.
   * Requires non-empty resolution notes (>= 5 chars) on resolution.
   * Atomically records resolvedAt and resolvedById.
   * Logs MAINTENANCE_RESOLVED or MAINTENANCE_UPDATED in AdminAudit.
   */
  async updateMaintenanceTicket(
    ticketId: string,
    dto: UpdateMaintenanceDto,
    adminId: string,
  ) {
    const ticket = await this.prisma.busMaintenance.findUnique({
      where: { id: ticketId },
      include: { bus: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Maintenance ticket '${ticketId}' not found.`);
    }

    if (ticket.status === MaintenanceStatus.RESOLVED) {
      throw new BadRequestException('Cannot modify an already RESOLVED maintenance ticket');
    }

    if (dto.status && dto.status !== ticket.status) {
      if (
        ticket.status === MaintenanceStatus.REPORTED &&
        dto.status !== MaintenanceStatus.IN_PROGRESS &&
        dto.status !== MaintenanceStatus.RESOLVED
      ) {
        throw new BadRequestException(
          `Invalid maintenance ticket state transition from ${ticket.status} to ${dto.status}`,
        );
      }

      if (
        ticket.status === MaintenanceStatus.IN_PROGRESS &&
        dto.status !== MaintenanceStatus.RESOLVED
      ) {
        throw new BadRequestException(
          `Invalid maintenance ticket state transition from ${ticket.status} to ${dto.status}`,
        );
      }
    }

    const isResolving = dto.status === MaintenanceStatus.RESOLVED;
    let resolvedAtValue: Date | undefined = undefined;
    let resolvedByIdValue: string | undefined = undefined;

    if (isResolving) {
      const resolutionNotes = dto.notes?.trim();
      if (!resolutionNotes || resolutionNotes.length < 5) {
        throw new BadRequestException(
          'Resolution notes / comments are required and must be at least 5 characters long',
        );
      }
      resolvedAtValue = dto.resolvedAt ? new Date(dto.resolvedAt) : new Date();
      resolvedByIdValue = adminId;
    }

    const updated = await this.prisma.busMaintenance.update({
      where: { id: ticketId },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
        ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(resolvedAtValue !== undefined ? { resolvedAt: resolvedAtValue } : {}),
        ...(resolvedByIdValue !== undefined ? { resolvedById: resolvedByIdValue } : {}),
      },
      include: {
        bus: {
          select: {
            id: true,
            plateNumber: true,
            model: true,
            status: true,
          },
        },
      },
    });

    if (isResolving) {
      await this.logAction(adminId, 'MAINTENANCE_RESOLVED', 'MAINTENANCE', ticketId, {
        ticketId,
        busId: ticket.busId,
        plateNumber: ticket.bus.plateNumber,
        previousStatus: ticket.status,
        newStatus: updated.status,
        notes: updated.notes,
        resolvedAt: updated.resolvedAt,
        resolvedById: adminId,
      });
    } else {
      await this.logAction(adminId, 'MAINTENANCE_UPDATED', 'MAINTENANCE', ticketId, {
        ticketId,
        previousStatus: ticket.status,
        newStatus: updated.status,
        busId: ticket.busId,
        plateNumber: ticket.bus.plateNumber,
        resolvedAt: updated.resolvedAt,
      });
    }

    return updated;
  }

  /**
   * POST /admin/buses/:id/release
   * Verifies no open maintenance work orders exist, restores bus status to ACTIVE and isActive = true.
   * Logs BUS_RELEASED_TO_SERVICE in AdminAudit.
   */
  async releaseBusToService(busId: string, adminId: string) {
    const bus = await this.prisma.bus.findUnique({
      where: { id: busId },
    });

    if (!bus) {
      throw new NotFoundException(`Bus with ID '${busId}' not found.`);
    }

    const activeTicket = await this.prisma.busMaintenance.findFirst({
      where: {
        busId,
        status: { in: [MaintenanceStatus.REPORTED, MaintenanceStatus.IN_PROGRESS] },
      },
    });

    if (activeTicket) {
      throw new BadRequestException(
        'Cannot release bus: active maintenance work orders remain unresolved',
      );
    }

    const updated = await this.prisma.bus.update({
      where: { id: busId },
      data: {
        status: BusStatus.ACTIVE,
        isActive: true,
      },
    });

    await this.logAction(adminId, 'BUS_RELEASED_TO_SERVICE', 'BUS', busId, {
      busId: updated.id,
      plateNumber: updated.plateNumber,
      previousStatus: bus.status,
      newStatus: updated.status,
    });

    return updated;
  }
}

