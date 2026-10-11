import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}

export class StudentLoginDto {
  @IsString()
  @IsNotEmpty()
  usn!: string;

  @IsString()
  @IsNotEmpty()
  dob!: string; // ISO date string e.g. "2004-05-15"
}

export class DriverLoginDto {
  @IsString()
  @IsNotEmpty()
  mobile!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;
}
