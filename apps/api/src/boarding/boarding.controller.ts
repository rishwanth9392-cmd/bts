import {
  Controller,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { BoardingDto } from './boarding.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { BoardingService } from './boarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.module';
import { Role, BoardingMethod } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('boarding')
export class BoardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boardingService: BoardingService,
  ) {}

  /**
   * Secure student check-in endpoint (APP method).
   * Derives student's assigned stop and route securely on backend.
   */
  @Post('check-in')
  @Roles(Role.STUDENT)
  async checkIn(
    @Body() checkInDto: CheckInDto,
    @CurrentUser() user: { id: string; sub?: string; role: string },
  ) {
    const studentIdentifier = user.sub || user.id;
    return this.boardingService.checkIn(studentIdentifier, checkInDto);
  }

  /**
   * Student drop / checkout endpoint (APP method).
   * Confirms active trip and previous boarding before recording drop event.
   */
  @Post('check-out')
  @Roles(Role.STUDENT)
  async checkOut(
    @Body() checkOutDto: CheckOutDto,
    @CurrentUser() user: { id: string; sub?: string; role: string },
  ) {
    const studentIdentifier = user.sub || user.id;
    return this.boardingService.checkOut(studentIdentifier, checkOutDto);
  }

  /**
   * Legacy / Admin boarding record creation.
   */
  @Post()
  async handleBoarding(
    @Body() boardingDto: BoardingDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    if (boardingDto.method === BoardingMethod.APP) {
      // APP method: Verify student is boarding for themselves
      const student = await this.prisma.student.findUnique({
        where: { id: boardingDto.studentId },
      });
      if (!student || student.userId !== user.id) {
        throw new ForbiddenException('Cannot board on behalf of another student');
      }
    } else if (boardingDto.method === BoardingMethod.MANUAL) {
      // MANUAL method: Only drivers or admins can execute
      if (user.role !== 'DRIVER' && user.role !== 'ADMIN') {
        throw new ForbiddenException('Only drivers and admins can use MANUAL method');
      }
    }

    return { success: true, received: boardingDto };
  }
}
