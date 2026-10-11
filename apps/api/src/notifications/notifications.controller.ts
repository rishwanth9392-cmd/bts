import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Fetch latest 50 notifications for the authenticated user (Student or Driver).
   */
  @Get()
  async getNotifications(
    @CurrentUser() user: { id: string; sub?: string; role: string },
  ) {
    const userId = user.sub || user.id;
    return this.notificationsService.getUserNotifications(userId, 50);
  }

  /**
   * Mark all unread notifications as read for the authenticated user.
   */
  @Patch('read-all')
  async markAllAsRead(
    @CurrentUser() user: { id: string; sub?: string; role: string },
  ) {
    const userId = user.sub || user.id;
    return this.notificationsService.markAllAsRead(userId);
  }

  /**
   * Mark a single notification as read, enforcing user ownership.
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string; role: string },
  ) {
    const userId = user.sub || user.id;
    return this.notificationsService.markAsRead(id, userId);
  }
}
