import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { UpdatePickupDto } from './dto/update-pickup.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('me/pickup')
  async getMyPickup(@CurrentUser() user: { id: string; sub?: string }) {
    return this.studentsService.getPickup(user.sub || user.id);
  }

  @Get('me/eta')
  async getMyEta(@CurrentUser() user: { id: string; sub?: string }) {
    return this.studentsService.getStudentEta(user.sub || user.id);
  }

  @Put('me/pickup')
  async updateMyPickup(
    @CurrentUser() user: { id: string; sub?: string },
    @Body() dto: UpdatePickupDto,
  ) {
    return this.studentsService.updatePickup(user.sub || user.id, dto);
  }

  @Delete('me/pickup')
  async deleteMyPickup(@CurrentUser() user: { id: string; sub?: string }) {
    return this.studentsService.deletePickup(user.sub || user.id);
  }
}
