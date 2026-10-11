import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { BusStatus, MaintenanceCategory, MaintenanceStatus, TripStatus } from '@prisma/client';

export class AssignTripDto {
  @IsString()
  @IsNotEmpty()
  routeId!: string;

  @IsString()
  @IsNotEmpty()
  busId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @IsDateString()
  startTime?: string;
}

export class SetActiveStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class LogAdminActionDto {
  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsString()
  @IsNotEmpty()
  targetType!: string;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateBusDto {
  @IsString()
  @IsNotEmpty()
  plateNumber!: string;

  @IsInt()
  @IsPositive({ message: 'capacity must be greater than 0' })
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBusDto {
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @IsOptional()
  @IsInt()
  @IsPositive({ message: 'capacity must be greater than 0' })
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateDriverDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsNotEmpty()
  licenseNumber!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CancelTripDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResolveSosDto {
  @IsString()
  @IsNotEmpty({ message: 'resolutionNotes is required to resolve an SOS alert' })
  @MinLength(5, { message: 'resolutionNotes must be at least 5 characters long' })
  resolutionNotes!: string;
}

export class CreateMaintenanceDto {
  @IsString()
  @IsNotEmpty()
  busId!: string;

  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateMaintenanceDto {
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  resolvedAt?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

