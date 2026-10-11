import { IsNotEmpty, IsString } from 'class-validator';

export class CheckOutDto {
  @IsString()
  @IsNotEmpty()
  tripId!: string;
}
