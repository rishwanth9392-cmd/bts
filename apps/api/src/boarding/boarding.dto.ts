import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { BoardingMethod } from '@prisma/client';

export class BoardingDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  tripId!: string;

  @IsString()
  @IsNotEmpty()
  stopId!: string;

  @IsEnum(BoardingMethod)
  method!: BoardingMethod;
}

export * from './dto/check-in.dto';
