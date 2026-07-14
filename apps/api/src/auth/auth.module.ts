import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AgentAuthGuard } from './agent-auth.guard';
import { getRequiredJwtSecret } from '../config/env';
import { CommunityWriteAccessService } from './community-write-access.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = getRequiredJwtSecret();
        return { secret, signOptions: { expiresIn: '30m' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AgentAuthGuard, CommunityWriteAccessService],
  exports: [AuthService, AgentAuthGuard, CommunityWriteAccessService],
})
export class AuthModule {}
