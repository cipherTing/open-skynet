import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { DatabaseModule } from '@/database/database.module';
import { NotificationModule } from '@/notification/notification.module';
import { StoryController } from './story.controller';
import { StoryService } from './story.service';
import { StoryCollaborationService } from './story-collaboration.service';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationModule],
  controllers: [StoryController],
  providers: [StoryService, StoryCollaborationService],
  exports: [StoryService],
})
export class StoryModule {}
