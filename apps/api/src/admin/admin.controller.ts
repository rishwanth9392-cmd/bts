import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  BusStatus,
  MaintenanceCategory,
  MaintenanceStatus,
  Role,
  TripStatus,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import {
  AssignTripDto,
  CancelTripDto,
  CreateBusDto,
  CreateDriverDto,
  CreateMaintenanceDto,
  LogAdminActionDto,
  ResolveSosDto,
  SetActiveStatusDto,
  UpdateBusDto,
  UpdateDriverDto,
  UpdateMaintenanceDto,
} from './dto/admin.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly assignmentIntegrityService: AssignmentIntegrityService,
  ) {}

  // =========================================================================
  // 1. FLEET (BUS) MANAGEMENT APIs
  // =========================================================================

  /**
   * GET /admin/buses
   * Retrieves buses with filtering, pagination, active trip, assigned driver, and maintenance count.
   */
  @Get('buses')
  async getBuses(
    @Query('search') search?: string,
    @Query('status') status?: BusStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getBuses({
      search,
      status,
      page,
      limit,
      skip,
      offset,
    });
  }

  /**
   * POST /admin/buses
   * Creates a new bus. Validates plate uniqueness and capacity (> 0).
   * Logs BUS_CREATED in AdminAudit.
   */
  @Post('buses')
  async createBus(@Body() dto: CreateBusDto, @Req() req: any) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.createBus(dto, adminId);
  }

  /**
   * PATCH /admin/buses/:id
   * Updates bus details (capacity, model, status, isActive).
   * Logs BUS_UPDATED in AdminAudit.
   */
  @Patch('buses/:id')
  async updateBus(
    @Param('id') busId: string,
    @Body() dto: UpdateBusDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.updateBus(busId, dto, adminId);
  }

  /**
   * PATCH /admin/buses/:id/active
   * Safely toggles bus active status guarded by deactivation conflict checks.
   */
  @Patch('buses/:id/active')
  async setBusActive(
    @Param('id') busId: string,
    @Body() dto: SetActiveStatusDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.setBusActive(busId, dto.isActive, adminId);
  }

  /**
   * POST /admin/buses/:id/release
   * Authorized release of bus to service once maintenance is resolved.
   */
  @Post('buses/:id/release')
  async releaseBusToService(@Param('id') busId: string, @Req() req: any) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.releaseBusToService(busId, adminId);
  }


  // =========================================================================
  // 2. DRIVER MANAGEMENT APIs
  // =========================================================================

  /**
   * GET /admin/drivers
   * Retrieves drivers with search, pagination, active trip, assigned bus, and status.
   * Suppresses password hashes and raw secrets.
   */
  @Get('drivers')
  async getDrivers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getDrivers({
      search,
      page,
      limit,
      skip,
      offset,
    });
  }

  /**
   * POST /admin/drivers
   * Creates a driver record linked to user authentication.
   * Logs DRIVER_CREATED in AdminAudit.
   */
  @Post('drivers')
  async createDriver(@Body() dto: CreateDriverDto, @Req() req: any) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.createDriver(dto, adminId);
  }

  /**
   * PATCH /admin/drivers/:id
   * Updates driver metadata (name, licenseNumber, phone, isActive).
   * Logs DRIVER_UPDATED in AdminAudit.
   */
  @Patch('drivers/:id')
  async updateDriver(
    @Param('id') driverId: string,
    @Body() dto: UpdateDriverDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.updateDriver(driverId, dto, adminId);
  }

  /**
   * PATCH /admin/drivers/:id/active
   * Safely toggles driver active status guarded by deactivation conflict checks.
   */
  @Patch('drivers/:id/active')
  async setDriverActive(
    @Param('id') driverId: string,
    @Body() dto: SetActiveStatusDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.setDriverActive(driverId, dto.isActive, adminId);
  }

  // =========================================================================
  // 3. TRIP OPERATIONS & FLEET TELEMETRY APIs
  // =========================================================================

  /**
   * GET /admin/trips
   * Retrieves trips with status filter, bus, driver, route, latest telemetry freshness, and occupancy.
   */
  @Get('trips')
  async getTrips(
    @Query('status') status?: TripStatus,
    @Query('routeId') routeId?: string,
    @Query('busId') busId?: string,
    @Query('driverId') driverId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getTrips({
      status,
      routeId,
      busId,
      driverId,
      page,
      limit,
      skip,
      offset,
    });
  }

  /**
   * POST /admin/trips/assign
   * Schedules/assigns a trip with strict driver & bus conflict validation.
   */
  @Post('trips/assign')
  async assignTrip(@Body() dto: AssignTripDto, @Req() req: any) {
    const adminId = req.user?.id || req.user?.sub;
    return this.assignmentIntegrityService.assertAndAssignTrip({
      ...dto,
      adminId,
    });
  }

  /**
   * POST /admin/trips/:id/cancel
   * Cancels a SCHEDULED or READY trip (or emergency aborts an ACTIVE trip with an audited reason).
   * Transitions status to CANCELLED, resets tracking caches if active, emits trip:cancelled via WS.
   * Logs TRIP_CANCELLED in AdminAudit.
   */
  @Post('trips/:id/cancel')
  async cancelTrip(
    @Param('id') tripId: string,
    @Body() dto: CancelTripDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.cancelTrip(tripId, adminId, dto.reason);
  }

  /**
   * GET /admin/fleet/status
   * Aggregates fleet-wide operational telemetry metrics:
   * Trip status counts, telemetry freshness buckets, total/active buses, unacknowledged SOS count.
   */
  @Get('fleet/status')
  async getFleetStatus() {
    return this.adminService.getFleetStatus();
  }

  // =========================================================================
  // 4. SOS & SAFETY MONITORING APIs
  // =========================================================================

  /**
   * GET /admin/sos
   * Fetches all TripAudit records where action = 'SOS'.
   * Includes associated trip, driver, bus, last known GPS, acknowledgement status, and resolution details.
   */
  @Get('sos')
  async getSosAlerts(
    @Query('status') status?: 'all' | 'unacknowledged' | 'unresolved',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getSosAlerts({
      status,
      page,
      limit,
      skip,
      offset,
    });
  }

  /**
   * POST /admin/sos/:id/acknowledge
   * Sets acknowledgedAt = now() and acknowledgedBy = adminId.
   * Logs SOS_ACKNOWLEDGED in AdminAudit.
   */
  @Post('sos/:id/acknowledge')
  async acknowledgeSos(@Param('id') sosAuditId: string, @Req() req: any) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.acknowledgeSos(sosAuditId, adminId);
  }

  /**
   * POST /admin/sos/:id/resolve
   * Requires resolutionNotes in the body. Sets resolvedAt = now().
   * Logs SOS_RESOLVED in AdminAudit.
   */
  @Post('sos/:id/resolve')
  async resolveSos(
    @Param('id') sosAuditId: string,
    @Body() dto: ResolveSosDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.resolveSos(sosAuditId, dto, adminId);
  }

  // =========================================================================
  // 5. MAINTENANCE FOUNDATION APIs
  // =========================================================================

  /**
   * GET /admin/maintenance
   * Filter by busId and status (REPORTED, IN_PROGRESS, RESOLVED), category.
   */
  @Get('maintenance')
  async getMaintenanceTickets(
    @Query('busId') busId?: string,
    @Query('status') status?: MaintenanceStatus,
    @Query('category') category?: MaintenanceCategory,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getMaintenanceTickets({
      busId,
      status,
      category,
      page,
      limit,
      skip,
      offset,
    });
  }

  /**
   * POST /admin/maintenance
   * Creates maintenance ticket (busId, category, description, notes).
   * Logs MAINTENANCE_CREATED in AdminAudit.
   */
  @Post('maintenance')
  async createMaintenanceTicket(
    @Body() dto: CreateMaintenanceDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.createMaintenanceTicket(dto, adminId);
  }

  /**
   * PATCH /admin/maintenance/:id
   * Updates status (REPORTED -> IN_PROGRESS -> RESOLVED), notes, and resolvedAt.
   * Logs MAINTENANCE_UPDATED in AdminAudit.
   */
  @Patch('maintenance/:id')
  async updateMaintenanceTicket(
    @Param('id') ticketId: string,
    @Body() dto: UpdateMaintenanceDto,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.updateMaintenanceTicket(ticketId, dto, adminId);
  }

  // =========================================================================
  // 6. AUDIT TRAIL API
  // =========================================================================

  /**
   * GET /admin/audit-logs
   * Retrieves paginated admin audit trail logs.
   */
  @Get('audit-logs')
  async getAuditLogs(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('adminId') adminId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('page') page?: string,
    @Query('skip') skip?: string,
  ) {
    return this.adminService.getAuditLogs({
      targetType,
      targetId,
      adminId,
      limit,
      offset,
      page,
      skip,
    });
  }

  /**
   * POST /admin/audit-logs
   * Explicitly logs an administrative action into the audit trail.
   */
  @Post('audit-logs')
  async logAdminAction(@Body() dto: LogAdminActionDto, @Req() req: any) {
    const adminId = req.user?.id || req.user?.sub;
    return this.adminService.logAction(
      adminId,
      dto.action,
      dto.targetType,
      dto.targetId,
      dto.metadata,
    );
  }
}
