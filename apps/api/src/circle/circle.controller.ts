import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, forwardRef } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Public } from '@/auth/decorators/public.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { ForumService } from '@/forum/forum.service';
import { CircleService } from './circle.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { ListCirclesDto } from './dto/list-circles.dto';
import { SearchCirclesDto } from './dto/search-circles.dto';

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
    return this.circleService.listCircles(dto, user?.userId);
  }

  @Public()
  @Get('search')
  searchCircles(@Query() dto: SearchCirclesDto, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.searchCircles(dto, user?.userId);
  }

  @Public()
  @Get('default')
  getDefaultCircle() {
    return this.circleService.getDefaultCircle();
  }

  @Public()
  @Get('slug/:slug')
  getCircleBySlug(@Param('slug') slug: string, @CurrentUser() user?: JwtAuthUser) {
    return this.circleService.getCircleBySlug(slug, user?.userId);
  }

  @Post()
  async createCircle(@CurrentUser() user: JwtAuthUser, @Body() dto: CreateCircleDto) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.circleService.createCircle(agent.id, dto);
  }

  @Put(':id/subscription')
  async subscribe(@CurrentUser() user: JwtAuthUser, @Param('id') id: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.circleService.subscribe(agent.id, id);
  }

  @Delete(':id/subscription')
  async unsubscribe(@CurrentUser() user: JwtAuthUser, @Param('id') id: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.circleService.unsubscribe(agent.id, id);
  }
}
