import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger, Optional } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { getJwtSecret } from '../auth/jwt-secret.helper';
import {
  TRIP_LOCATION,
  TRIP_STARTED,
  TRIP_STOPPED,
  TRIP_COMPLETED,
  TRIP_SUBSCRIBE,
  TRIP_UNSUBSCRIBE,
  USER_SUBSCRIBE,
  USER_UNSUBSCRIBE,
  PICKUP_ARRIVED,
  TRIP_OCCUPANCY,
  NOTIFICATION_NEW,
  TRIP_PROGRESS,
  STUDENT_ETA,
  ADMIN_SOS,
  TripLocationPayload,
  TripLifecyclePayload,
  PickupArrivedPayload,
  TripOccupancyPayload,
  TripProgressPayload,
  StudentEtaPayload,
  AdminSosPayload,
  TelemetryWarningPayload,
} from '@bts/shared';

@WebSocketGateway({ cors: true })
export class TripsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TripsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      let token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization;

      if (!token && client.handshake.query?.token) {
        token = client.handshake.query.token as string;
      }

      if (!token) {
        this.logger.warn(`Socket connection rejected: Missing token (${client.id})`);
        client.disconnect(true);
        return;
      }

      if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });

      client.data.user = payload;
      this.logger.log(`Socket authenticated for user ${payload.sub} (${client.id})`);

      // Automatically join user-specific room for targeted notifications
      if (payload.sub) {
        client.join(`user:${payload.sub}`);
        this.logger.log(`Socket ${client.id} joined personal room user:${payload.sub}`);
      }

      // Automatically join isolated admin room if role is ADMIN
      if (payload.role === 'ADMIN') {
        client.join('admin');
        this.logger.log(`Socket ${client.id} joined administrative room 'admin'`);
      }
    } catch {
      this.logger.warn(`Socket connection rejected: Invalid token (${client.id})`);
      client.disconnect(true);
    }
  }

  /**
   * Verifies whether an authenticated user is legitimately permitted to track a trip room.
   * Admins: always permitted.
   * Drivers: permitted if assigned to this trip.
   * Students: permitted if assigned to the route or already boarded on this trip.
   */
  async canAccessTrip(
    user: { sub: string; role?: string },
    tripId: string,
  ): Promise<boolean> {
    if (!user || !user.sub) return false;
    // Disallow non-admins from accessing administrative rooms
    if (tripId === 'admin' || tripId.startsWith('admin:')) {
      return user.role === Role.ADMIN || user.role === 'ADMIN';
    }
    if (user.role === Role.ADMIN || user.role === 'ADMIN') return true;

    if (!this.prisma) {
      return true;
    }

    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: { driver: true },
      });

      if (!trip) return false;

      if (user.role === Role.DRIVER || user.role === 'DRIVER') {
        return trip.driver?.userId === user.sub || trip.driverId === user.sub;
      }

      if (user.role === Role.STUDENT || user.role === 'STUDENT') {
        const student = await this.prisma.student.findFirst({
          where: {
            OR: [{ userId: user.sub }, { id: user.sub }],
          },
          include: {
            pickupAssignment: true,
          },
        });

        if (!student) return false;

        // Permitted if assigned to the route of this trip
        if (
          student.pickupAssignment?.active &&
          student.pickupAssignment.routeId === trip.routeId
        ) {
          return true;
        }

        // Permitted if student has an existing boarding on this trip
        const hasBoarded = await this.prisma.boardingEvent.findFirst({
          where: {
            tripId,
            studentId: student.id,
          },
        });

        return Boolean(hasBoarded);
      }

      return false;
    } catch (err) {
      this.logger.error(
        `Error verifying trip access for user ${user.sub} on trip ${tripId}: ${err}`,
      );
      return false;
    }
  }

  @SubscribeMessage(TRIP_SUBSCRIBE)
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string } | string,
  ) {
    const tripId = typeof data === 'string' ? data : data?.tripId;
    if (!tripId) {
      return { event: 'error', message: 'Missing tripId' };
    }

    const user = client.data?.user;
    if (!user || !user.sub) {
      this.logger.warn(
        `Unauthorized trip subscribe attempt by unauthenticated socket ${client.id}`,
      );
      return { event: 'error', message: 'Unauthorized' };
    }

    const hasAccess = await this.canAccessTrip(user, tripId);
    if (!hasAccess) {
      this.logger.warn(
        `Forbidden trip subscribe attempt: User ${user.sub} (${user.role}) denied access to trip ${tripId}`,
      );
      return { event: 'error', message: 'Forbidden: Unauthorized trip subscription' };
    }

    const room = `trip:${tripId}`;
    const roomsSet = client.rooms as Set<string> | string[] | undefined;
    const isAlreadyInRoom =
      roomsSet instanceof Set
        ? roomsSet.has(room)
        : Array.isArray(roomsSet)
        ? roomsSet.includes(room)
        : false;

    if (isAlreadyInRoom) {
      this.logger.log(`Socket ${client.id} already in room ${room} (idempotent subscribe)`);
      return { event: 'subscribed', room, idempotent: true };
    }

    client.join(room);
    this.logger.log(`Socket ${client.id} (user ${user.sub}) joined room ${room}`);
    return { event: 'subscribed', room };
  }

  @SubscribeMessage('admin:subscribe')
  handleAdminSubscribe(@ConnectedSocket() client: Socket) {
    const user = client.data?.user;
    if (!user || (user.role !== Role.ADMIN && user.role !== 'ADMIN')) {
      this.logger.warn(
        `Forbidden admin subscribe attempt: Socket ${client.id} (${user?.role}) denied access to 'admin' room`,
      );
      return { event: 'error', message: 'Forbidden: Admin access required' };
    }

    const roomsSet = client.rooms as Set<string> | string[] | undefined;
    const isAlreadyInRoom =
      roomsSet instanceof Set
        ? roomsSet.has('admin')
        : Array.isArray(roomsSet)
        ? roomsSet.includes('admin')
        : false;

    if (isAlreadyInRoom) {
      return { event: 'subscribed', room: 'admin', idempotent: true };
    }

    client.join('admin');
    this.logger.log(`Socket ${client.id} joined administrative room 'admin'`);
    return { event: 'subscribed', room: 'admin' };
  }

  @SubscribeMessage('admin')
  handleAdminRoomJoin(@ConnectedSocket() client: Socket) {
    return this.handleAdminSubscribe(client);
  }

  @SubscribeMessage(TRIP_UNSUBSCRIBE)
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string } | string,
  ) {
    const tripId = typeof data === 'string' ? data : data?.tripId;
    if (tripId) {
      const room = `trip:${tripId}`;
      client.leave(room);
      this.logger.log(`Socket ${client.id} left room ${room}`);
      return { event: 'unsubscribed', room };
    }
  }

  @SubscribeMessage(USER_SUBSCRIBE)
  handleUserSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { userId?: string } | string,
  ) {
    const authenticatedUserId = client.data?.user?.sub;
    if (!authenticatedUserId) {
      this.logger.warn(
        `Unauthenticated user subscribe attempt from socket ${client.id}`,
      );
      return { event: 'error', message: 'Unauthorized' };
    }

    const requestedUserId = typeof data === 'string' ? data : data?.userId;
    // Reject any spoofing attempt where requested userId does not match authenticated identity
    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      this.logger.warn(
        `Room spoofing rejected: Socket ${client.id} (${authenticatedUserId}) attempted to subscribe to private room user:${requestedUserId}`,
      );
      return {
        event: 'error',
        message: "Forbidden: Cannot subscribe to another user's private room",
      };
    }

    const room = `user:${authenticatedUserId}`;
    const roomsSet = client.rooms as Set<string> | string[] | undefined;
    const isAlreadyInRoom =
      roomsSet instanceof Set
        ? roomsSet.has(room)
        : Array.isArray(roomsSet)
        ? roomsSet.includes(room)
        : false;

    if (isAlreadyInRoom) {
      return { event: 'subscribed', room, idempotent: true };
    }

    client.join(room);
    this.logger.log(
      `Socket ${client.id} confirmed subscription to private room ${room}`,
    );
    return { event: 'subscribed', room };
  }

  @SubscribeMessage(USER_UNSUBSCRIBE)
  handleUserUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { userId?: string } | string,
  ) {
    const authenticatedUserId = client.data?.user?.sub;
    if (!authenticatedUserId) {
      return { event: 'error', message: 'Unauthorized' };
    }

    const requestedUserId = typeof data === 'string' ? data : data?.userId;
    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      this.logger.warn(
        `Unauthorized room unsubscribe rejected: Socket ${client.id} attempted to unsubscribe from user:${requestedUserId}`,
      );
      return {
        event: 'error',
        message: "Forbidden: Cannot unsubscribe another user's private room",
      };
    }

    const room = `user:${authenticatedUserId}`;
    client.leave(room);
    this.logger.log(`Socket ${client.id} unsubscribed from room ${room}`);
    return { event: 'unsubscribed', room };
  }

  broadcastLocation(tripId: string, payload: TripLocationPayload) {
    if (this.server) {
      this.server.to(`trip:${tripId}`).emit(TRIP_LOCATION, payload);
    }
  }

  broadcastTripStarted(tripId: string, payload: TripLifecyclePayload) {
    if (this.server) {
      this.server.to(`trip:${tripId}`).emit(TRIP_STARTED, payload);
    }
  }

  broadcastTripStopped(tripId: string, payload: TripLifecyclePayload) {
    this.broadcastTripCompleted(tripId, payload);
  }

  broadcastTripCompleted(tripId: string, payload: TripLifecyclePayload) {
    if (this.server) {
      this.server.to(`trip:${tripId}`).emit(TRIP_COMPLETED, payload);
      this.server.to(`trip:${tripId}`).emit(TRIP_STOPPED, payload);
    }
  }

  broadcastTripCancelled(tripId: string, payload: any) {
    if (this.server) {
      this.server.to(`trip:${tripId}`).emit('trip:cancelled', payload);
      this.server.to('admin').emit('trip:cancelled', payload);
    }
  }

  emitPickupArrived(userId: string, payload: PickupArrivedPayload) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(PICKUP_ARRIVED, payload);
    }
  }

  broadcastOccupancy(tripId: string, payload: TripOccupancyPayload) {
    if (this.server) {
      this.server.to(`trip:${tripId}`).emit(TRIP_OCCUPANCY, payload);
    }
  }

  emitNewNotification(userId: string, payload: unknown) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(NOTIFICATION_NEW, payload);
      this.logger.log(`Emitted ${NOTIFICATION_NEW} to personal room user:${userId}`);
    }
  }

  broadcastTripProgress(tripId: string, payload: TripProgressPayload) {
    if (this.server) {
      this.server.to(`trip:${tripId}`).emit(TRIP_PROGRESS, payload);
    }
  }

  emitStudentEta(userId: string, studentId: string | undefined, payload: StudentEtaPayload) {
    if (this.server) {
      const broadcaster = this.server.to(`user:${userId}`);
      if (studentId && studentId !== userId) {
        broadcaster.to(`user:${studentId}`);
      }
      broadcaster.emit(STUDENT_ETA, payload);
    }
  }

  emitBoardingConfirmed(userId: string, payload: unknown) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit('boarding:confirmed', payload);
      this.logger.log(`Emitted boarding:confirmed to personal room user:${userId}`);
    }
  }

  emitDropoffConfirmed(userId: string, payload: unknown) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit('dropoff:confirmed', payload);
      this.logger.log(`Emitted dropoff:confirmed to personal room user:${userId}`);
    }
  }

  broadcastAdminSos(payload: AdminSosPayload) {
    if (this.server) {
      this.server.to('admin').emit(ADMIN_SOS, payload);
      this.logger.warn(`EMERGENCY: Emitted ${ADMIN_SOS} strictly to admin room for trip ${payload.tripId}`);
    }
  }

  broadcastTelemetryWarning(
    event: 'telemetry:stale' | 'telemetry:offline' | 'telemetry:recovered' | 'telemetry:live' | string,
    payload: TelemetryWarningPayload,
  ) {
    if (this.server) {
      this.server.to('admin').emit(event, payload);
      this.logger.warn(
        `Telemetry alert: Emitted ${event} strictly to admin room for trip ${payload.tripId} (status: ${payload.currentState})`,
      );
    }
  }
}

