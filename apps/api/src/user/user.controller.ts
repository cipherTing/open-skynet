import {
  Controller,
  Patch,
  Post,
  Get,
  Body,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserService } from './user.service';
import { CreateGuideLinkDto } from './dto/create-guide-link.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { DEFAULT_AGENT_REVISIT_INTERVAL_HOURS } from '@/system/public-access.constants';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { Agent } from '@/database/schemas/agent.schema';
import { ProgressionService } from '@/progression/progression.service';
import { apiErrors } from '@/common/i18n/api-message';
import { authErrors } from '@/common/errors/business-errors';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly progressionService: ProgressionService,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
  ) {}

  private async getAgent(userId: string) {
    const agent = await this.agentModel.findOne({ userId });
    if (!agent) {
      throw authErrors.userAgentRequired();
    }
    return agent;
  }

  private ensureUserOnly(user: JwtAuthUser) {
    if (user.authType === 'agent') {
      throw authErrors.userOnlyOperation();
    }
  }

  private async getAgentForCurrentPrincipal(user: JwtAuthUser) {
    if (user.authType === 'agent') {
      if (!user.agentId) {
        throw authErrors.invalidAgentIdentity();
      }
      const agent = await this.agentModel.findById(user.agentId);
      if (!agent) {
        throw authErrors.invalidAgentIdentity();
      }
      return agent;
    }
    return this.getAgent(user.userId);
  }

  @Patch('me/agent')
  async updateAgent(@CurrentUser() user: JwtAuthUser, @Body() dto: UpdateAgentDto) {
    if (
      user.authType === 'agent'
      && (dto.favoritesPublic !== undefined || dto.ownerOperationEnabled !== undefined)
    ) {
      throw apiErrors.forbidden(
        'AGENT_PROFILE_FIELDS_FORBIDDEN',
        'api.errors.agentProfileFieldsForbidden',
      );
    }
    const agent = await this.getAgentForCurrentPrincipal(user);
    return this.userService.updateAgent(agent.id, dto);
  }

  @Post('me/agent/regenerate-key')
  async regenerateKey(@CurrentUser() user: JwtAuthUser) {
    this.ensureUserOnly(user);
    const agent = await this.getAgent(user.userId);
    return this.userService.regenerateKey(agent.id);
  }

  @Post('me/agent/guide-link')
  async createGuideLink(@CurrentUser() user: JwtAuthUser, @Body() dto?: CreateGuideLinkDto) {
    this.ensureUserOnly(user);
    const agent = await this.getAgent(user.userId);
    return this.userService.createGuideLink(
      agent.id,
      dto?.revisitIntervalHours ?? DEFAULT_AGENT_REVISIT_INTERVAL_HOURS,
    );
  }

  @Get('me/agent/key-info')
  async getKeyInfo(@CurrentUser() user: JwtAuthUser) {
    this.ensureUserOnly(user);
    const agent = await this.getAgent(user.userId);
    return this.userService.getKeyInfo(agent.id);
  }

  @Get('me/agent/progression')
  async getProgression(@CurrentUser() user: JwtAuthUser) {
    const agent = await this.getAgentForCurrentPrincipal(user);
    return this.progressionService.getCurrentAgentProgression(agent.id);
  }
}
