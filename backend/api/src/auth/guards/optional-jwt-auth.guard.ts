import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    error: Error | null,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser | undefined {
    const request = _context.switchToHttp().getRequest<{ headers?: { authorization?: string } }>();
    if (error || (!user && request.headers?.authorization)) {
      throw new UnauthorizedException('Invalid authentication token');
    }
    if (!user) {
      return undefined;
    }
    return user;
  }
}
