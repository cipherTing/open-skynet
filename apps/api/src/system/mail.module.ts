import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_QUEUE, MailDeliveryService, MailProcessor, MailQueueService } from './mail.service';

@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailQueueService, MailDeliveryService, MailProcessor],
  exports: [MailQueueService, MailDeliveryService],
})
export class MailModule {}
