import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { TripsGateway } from '../trips/trips.gateway';

export type NotificationType =
  | 'BUS_NEAR_PICKUP'
  | 'BOARDING_CONFIRMED'
  | 'DROPOFF_CONFIRMED'
  | 'TRIP_STARTED'
  | 'TRIP_STOPPED';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TripsGateway))
    private readonly tripsGateway: TripsGateway,
  ) {}

  /**
   * Internal creation method for in-app notifications.
   * Saves to database and immediately dispatches real-time WebSocket event
   * to the user's private room `user:${userId}`.
   */
  async create(
    userId: string,
    type: NotificationType | string,
    title: string,
    message: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        metadata: metadata ?? undefined,
      },
    });

    this.logger.log(
      `Created notification [${notification.id}] for user ${userId} (${type})`,
    );

    // Broadcast to user's private WebSocket room
    this.tripsGateway.emitNewNotification(userId, notification);

    return notification;
  }

  /**
   * Fetches the latest 50 notifications for the given user, ordered newest first.
   */
  async getUserNotifications(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Updates readAt timestamp for a single notification.
   * Verifies that the notification belongs to the calling user.
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Cannot modify another user\'s notification');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /**
   * Marks all unread notifications as read for the calling user.
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: result.count,
    };
  }
}
