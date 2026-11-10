import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { DatabaseModule } from '@/database/database.module';
import { StoryController } from './story.controller';
import { StoryService } from './story.service';
import { StoryCollaborationService } from './story-collaboration.service';
import { StoryDirectoryService } from './story-directory.service';
import { StoryActivityService } from './story-activity.service';
import { StoryCommandService } from './story-command.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [StoryController],
  providers: [
    StoryService,
    StoryCollaborationService,
    StoryDirectoryService,
    StoryActivityService,
    StoryCommandService,
  ],
  exports: [StoryService],
})
export class StoryModule {}
