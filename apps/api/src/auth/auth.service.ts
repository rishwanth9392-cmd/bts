import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async logAuthEvent(userId: string | undefined, success: boolean) {
    if (!userId) return; // Can only log if we resolved a user identity
    
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: userId,
      }
    });
  }

  /**
   * Admin login: email + bcrypt password verification.
   */
  async loginAdmin(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.role !== 'ADMIN') {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      await this.logAuthEvent(user.id, false);
      throw new UnauthorizedException('Password not configured for this account');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.logAuthEvent(user.id, false);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.logAuthEvent(user.id, true);
    return this.generateTokens(user.id, user.role);
  }

  /**
   * Student login: USN + date-of-birth verification.
   */
  async loginStudent(usn: string, dob: string) {
    const student = await this.prisma.student.findUnique({
      where: { usn },
      include: { user: true },
    });

    if (!student) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate DOB — compare date portion only
    if (student.dob) {
      const studentDob = student.dob.toISOString().split('T')[0];
      const inputDob = new Date(dob).toISOString().split('T')[0];
      if (studentDob !== inputDob) {
        await this.logAuthEvent(student.userId, false);
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      // If no DOB is set on the student record, reject login
      await this.logAuthEvent(student.userId, false);
      throw new UnauthorizedException('Date of birth not configured for this student');
    }

    await this.logAuthEvent(student.userId, true);
    return this.generateTokens(student.user.id, student.user.role);
  }

  /**
   * Driver login: mobile + OTP verification.
   * OTP is restricted to dev/test environments; strictly prohibited in production.
   */
  async loginDriver(mobile: string, otp: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException(
        'Mock OTP authentication is strictly prohibited in production environments. SMS OTP provider required.',
      );
    }

    const driver = await this.prisma.driver.findFirst({
      where: { phone: mobile },
      include: { user: true },
    });

    if (!driver) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const MOCK_OTP = '123456';
    if (otp !== MOCK_OTP) {
      await this.logAuthEvent(driver.userId, false);
      throw new UnauthorizedException('Invalid OTP');
    }

    this.logger.warn(
      `[SECURITY WARNING] Driver ${driver.id} authenticated using dev/test mock OTP. Prohibited in production.`,
    );

    await this.logAuthEvent(driver.userId, true);
    return this.generateTokens(driver.user.id, driver.user.role);
  }

  /**
   * Get current user profile from JWT subject.
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        student: {
          select: {
            id: true,
            usn: true,
            phone: true,
            active: true,
          },
        },
        driver: {
          select: {
            id: true,
            licenseNumber: true,
            phone: true,
            active: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Generate access token with user ID and role in the payload.
   */
  private generateTokens(userId: string, role: string) {
    const payload = { sub: userId, role };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
