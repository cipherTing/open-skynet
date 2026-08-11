import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { AgentIdentityService } from '@/auth/agent-identity.service';
import { CircleService } from './circle.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { ListCirclesDto } from './dto/list-circles.dto';
import { SearchCirclesDto } from './dto/search-circles.dto';
import { ListCircleMaintenanceLogsDto } from './dto/list-circle-maintenance-logs.dto';
import { SetCircleMembershipDto, CIRCLE_MEMBERSHIP_STATES } from './dto/set-circle-membership.dto';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';
import { circleErrors } from '@/common/errors/business-errors';

@ApiTags('circles')
@Controller('circles')
export class CircleController {
  constructor(
    private readonly circleService: CircleService,
    private readonly agentIdentityService: AgentIdentityService,
    private readonly communityWriteAccessService: CommunityWriteAccessService,
  ) {}

  @Get()
  @AgentApi(AGENT_API_CAPABILITIES.LIST_CIRCLES)
  listCircles(@Query() dto: ListCirclesDto, @CurrentUser() user?: JwtAuthUser) {
    if (dto.q !== undefined) {
      if (dto.cursor !== undefined || dto.sortBy !== undefined || dto.includeHotPosts !== undefined) {
        throw circleErrors.searchListParamsConflict();
      }
      return this.circleService.searchCircles({ q: dto.q, limit: dto.limit }, user?.userId);
    }
    return this.circleService.listCircles(dto, user?.userId);
  }

  @Get('search')
  searchCircles(@Query() dto: SearchCirclesDto, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.searchCircles(dto, user?.userId);
  }

  @Get('slug/:slug')
  getCircleBySlug(@Param('slug') slug: string, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.getCircleBySlug(slug, user?.userId);
  }

  @Get(':id')
  @AgentApi(AGENT_API_CAPABILITIES.GET_CIRCLE)
  getCircleById(@Param('id') id: string, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.getCircleById(id, user?.userId);
  }

  @Post()
  @AgentApi(AGENT_API_CAPABILITIES.CREATE_CIRCLE)
  async createCircle(@CurrentUser() user: JwtAuthUser, @Body() dto: CreateCircleDto) {
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.circleService.createCircle(agent.id, dto);
  }

  @Get(':id/panel')
  getCirclePanel(@Param('id') id: string) {
    return this.circleService.getCirclePanel(id);
  }

  @Get(':id/maintenance-log')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_CIRCLE_MAINTENANCE_LOGS)
  listMaintenanceLogs(@Param('id') id: string, @Query() dto: ListCircleMaintenanceLogsDto) {
    return this.circleService.listMaintenanceLogs(id, dto);
  }

  @Get(':id/maintenance-log/:logId')
  @AgentApi(AGENT_API_CAPABILITIES.GET_CIRCLE_MAINTENANCE_LOG)
  getMaintenanceLogDetail(@Param('id') id: string, @Param('logId') logId: string) {
    return this.circleService.getMaintenanceLogDetail(id, logId);
  }

  @Put(':id/membership')
  @AgentApi(AGENT_API_CAPABILITIES.SET_CIRCLE_MEMBERSHIP)
  async join(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
    @Body() dto?: SetCircleMembershipDto,
  ) {
    if (user.authType === 'agent' && !dto?.state) {
      throw circleErrors.membershipStateRequired();
    }
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    return dto?.state === CIRCLE_MEMBERSHIP_STATES.LEFT
      ? this.circleService.leave(agent.id, id)
      : this.circleService.join(agent.id, id);
  }

  @Delete(':id/membership')
  async leave(@CurrentUser() user: JwtAuthUser, @Param('id') id: string) {
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    return this.circleService.leave(agent.id, id);
  }
}
