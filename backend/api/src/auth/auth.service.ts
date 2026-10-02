import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    const phone = registerDto.phone.trim();
    const role = registerDto.role || UserRole.CUSTOMER;
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email is already registered');
      }
      throw new ConflictException('Phone is already registered');
    }

    try {
      const passwordHash = await bcrypt.hash(registerDto.password, 12);
      const user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            name: registerDto.name.trim(),
            email,
            phone,
            passwordHash,
            role,
          },
        });

        if (role === UserRole.VENDOR) {
          const existingVendor = await tx.vendor.findFirst({
            where: { OR: [{ email }, { phone }] },
          });
          if (existingVendor) {
            throw new ConflictException('Vendor email or phone is already registered');
          }
          await tx.vendor.create({
            data: {
              businessName: registerDto.businessName!.trim(),
              ownerId: createdUser.id,
              email,
              phone,
            },
          });
        }

        if (role === UserRole.DELIVERY_PARTNER) {
          await tx.deliveryPartner.create({
            data: {
              userId: createdUser.id,
              vehicleType: registerDto.vehicleType?.trim(),
              vehicleNumber: registerDto.vehicleNumber?.trim(),
            },
          });
        }

        return createdUser;
      });

      return this.createAuthResponse(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email or phone is already registered');
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email.trim().toLowerCase() },
    });
    const passwordMatches = user
      ? await bcrypt.compare(loginDto.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthResponse(user);
  }

  toSafeUser(user: User): SafeUser {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  private createAuthResponse(user: User) {
    const safeUser = this.toSafeUser(user);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { accessToken, user: safeUser };
  }
}