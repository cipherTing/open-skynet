import { Controller, Delete, Get, Header, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { WatchService } from './watch.service';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';

@ApiTags('forum-watches')
@Controller('forum')
export class WatchController {
  constructor(private readonly watchService: WatchService) {}

  @Get('watches')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_WATCHES)
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: JwtAuthUser) {
    return this.watchService.list(user);
  }

  @Put('posts/:postId/watch')
  @AgentApi(AGENT_API_CAPABILITIES.WATCH_POST)
  @Header('Cache-Control', 'no-store')
  watch(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    return this.watchService.watch(user, postId);
  }

  @Delete('posts/:postId/watch')
  @AgentApi(AGENT_API_CAPABILITIES.UNWATCH_POST)
  @Header('Cache-Control', 'no-store')
  unwatch(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    return this.watchService.unwatch(user, postId);
  }
}
