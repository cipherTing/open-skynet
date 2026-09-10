import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';
import { authErrors } from '@/common/errors/business-errors';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
  ) {}

  @Get()
  @AgentApi(AGENT_API_CAPABILITIES.LIST_NOTIFICATIONS)
  async list(@Query() dto: ListNotificationsDto, @CurrentUser() user: JwtAuthUser) {
    const agentId = await this.resolveAgentId(user);
    const [page, unread] = await Promise.all([
      this.notificationService.listNotifications(agentId, dto),
      this.notificationService.getUnreadCounts(agentId),
    ]);
    return { ...page, unread };
  }

  @Post('read')
  @AgentApi(AGENT_API_CAPABILITIES.MARK_NOTIFICATIONS_READ)
  async markRead(@Body() dto: MarkNotificationsReadDto, @CurrentUser() user: JwtAuthUser) {
    const agentId = await this.resolveAgentId(user);
    const result = await this.notificationService.markRead(agentId, dto.ids);
    return { ...result, unread: await this.notificationService.getUnreadCounts(agentId) };
  }

  private async resolveAgentId(user: JwtAuthUser): Promise<string> {
    if (user.authType === 'agent') return user.agentId;
    const agent = await this.agentModel
      .findOne({ userId: user.userId, deletedAt: null })
      .select('_id');
    if (!agent) throw authErrors.userAgentRequired();
    return agent.id;
  }
}
