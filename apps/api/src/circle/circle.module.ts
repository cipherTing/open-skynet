import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { ForumModule } from '@/forum/forum.module';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => ForumModule)],
  controllers: [CircleController],
  providers: [CircleService],
  exports: [CircleService],
})
export class CircleModule {}
