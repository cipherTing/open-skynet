import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  forwardRef,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Public } from '@/auth/decorators/public.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { ForumService } from '@/forum/forum.service';
import { CircleService } from './circle.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { ListCirclesDto } from './dto/list-circles.dto';
import { SearchCirclesDto } from './dto/search-circles.dto';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { PinCirclePostDto } from './dto/pin-circle-post.dto';
import { UnpinCirclePostDto } from './dto/unpin-circle-post.dto';
import { ListCircleMaintenanceLogsDto } from './dto/list-circle-maintenance-logs.dto';
import { TransferCircleStewardshipDto } from './dto/transfer-circle-stewardship.dto';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';

@ApiTags('circles')
@Controller('circles')
export class CircleController {
  constructor(
    private readonly circleService: CircleService,
    @Inject(forwardRef(() => ForumService))
    private readonly forumService: ForumService,
  ) {}

  @Public()
  @Get()
  listCircles(@Query() dto: ListCirclesDto, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.listCircles(dto, user?.userId, user?.authType);
  }

  @Public()
  @Get('search')
  searchCircles(@Query() dto: SearchCirclesDto, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.searchCircles(dto, user?.userId, user?.authType);
  }

  @Public()
  @Get('default')
  getDefaultCircle() {
    return this.circleService.getDefaultCircle();
  }

  @Public()
  @Get('slug/:slug')
  getCircleBySlug(@Param('slug') slug: string, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.getCircleBySlug(slug, user?.userId, user?.authType);
  }

  @Post()
  async createCircle(@CurrentUser() user: JwtAuthUser, @Body() dto: CreateCircleDto) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.createCircle(agent.id, dto);
  }

  @Patch(':id')
  async updateCircle(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCircleDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.updateCircle(agent.id, id, dto);
  }

  @Put(':id/pins/:postId')
  async pinPost(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: PinCirclePostDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.pinPost(agent.id, id, postId, dto);
  }

  @Patch(':id/pins/:postId/unpin')
  async unpinPost(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: UnpinCirclePostDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.unpinPost(agent.id, id, postId, dto);
  }

  @Public()
  @Get(':id/maintenance-log')
  listMaintenanceLogs(
    @Param('id') id: string,
    @Query() dto: ListCircleMaintenanceLogsDto,
  ) {
    return this.circleService.listMaintenanceLogs(id, dto);
  }

  @Get(':id/stewardship-readiness')
  async getStewardshipReadiness(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.getStewardshipReadiness(agent.id, id);
  }

  @Put(':id/stewardship-readiness')
  async enableStewardshipReadiness(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.setStewardshipReadiness(agent.id, id, true);
  }

  @Delete(':id/stewardship-readiness')
  async disableStewardshipReadiness(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.setStewardshipReadiness(agent.id, id, false);
  }

  @Patch(':id/steward')
  async transferStewardship(
    @CurrentUser() user: JwtAuthUser,
    @Param('id') id: string,
    @Body() dto: TransferCircleStewardshipDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.transferStewardship(agent.id, id, dto);
  }

  @Put(':id/subscription')
  async subscribe(@CurrentUser() user: JwtAuthUser, @Param('id') id: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.subscribe(agent.id, id);
  }

  @Delete(':id/subscription')
  async unsubscribe(@CurrentUser() user: JwtAuthUser, @Param('id') id: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return this.circleService.unsubscribe(agent.id, id);
  }
}
