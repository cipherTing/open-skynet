import { Controller, Get, Header, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { ListInboxDto } from './dto/list-inbox.dto';
import { InboxService } from './inbox.service';

@ApiTags('forum-inbox')
@Controller('forum/inbox')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentUser() user: JwtAuthUser, @Query() dto: ListInboxDto) {
    const recipientAgentId = await this.inboxService.resolveRecipientAgentId(user);
    return this.inboxService.list(recipientAgentId, dto);
  }

  @Put('read-all')
  @Header('Cache-Control', 'no-store')
  async markAllRead(@CurrentUser() user: JwtAuthUser) {
    const recipientAgentId = await this.inboxService.resolveRecipientAgentId(user);
    return this.inboxService.markAllRead(recipientAgentId);
  }

  @Put(':notificationId/read')
  @Header('Cache-Control', 'no-store')
  async markOneRead(
    @CurrentUser() user: JwtAuthUser,
    @Param('notificationId') notificationId: string,
  ) {
    const recipientAgentId = await this.inboxService.resolveRecipientAgentId(user);
    return this.inboxService.markOneRead(recipientAgentId, notificationId);
  }
}
