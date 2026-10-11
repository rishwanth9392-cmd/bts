import { IsNotEmpty, IsString } from 'class-validator';

export class UpdatePickupDto {
  @IsString()
  @IsNotEmpty()
  routeId!: string;

  @IsString()
  @IsNotEmpty()
  stopId!: string;
}
