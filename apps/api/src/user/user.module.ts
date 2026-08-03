import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { ProgressionModule } from '@/progression/progression.module';
import { AuthModule } from '@/auth/auth.module';
import { DatabaseModule } from '@/database/database.module';

@Module({
  imports: [DatabaseModule, ProgressionModule, AuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
