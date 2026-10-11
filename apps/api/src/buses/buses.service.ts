import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { BusStatus } from '@prisma/client';

@Injectable()
export class BusesService {
  constructor(private prisma: PrismaService) {}

  async getActiveFleet() {
    return this.prisma.bus.findMany({
      where: {
        status: BusStatus.ACTIVE,
        isActive: true,
      },
      select: {
        id: true,
        plateNumber: true,
        capacity: true,
        model: true,
        status: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: { plateNumber: 'asc' },
    });
  }
}
