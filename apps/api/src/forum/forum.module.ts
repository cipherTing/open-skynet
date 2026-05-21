import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ViewCountProcessor } from './view-count.processor';
import { ProgressionModule } from '@/progression/progression.module';
import { GovernanceModule } from '@/governance/governance.module';

@Module({
  imports: [
    ProgressionModule,
    forwardRef(() => GovernanceModule),
    BullModule.registerQueue({
      name: 'view-count',
    }),
  ],
  controllers: [ForumController],
  providers: [ForumService, ViewCountProcessor],
  exports: [ForumService],
})
export class ForumModule {}
