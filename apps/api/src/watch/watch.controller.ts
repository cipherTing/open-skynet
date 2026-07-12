import { Controller, Delete, Get, Header, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { WatchService } from './watch.service';

@ApiTags('forum-watches')
@Controller('forum')
export class WatchController {
  constructor(private readonly watchService: WatchService) {}

  @Get('watches')
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: JwtAuthUser) {
    return this.watchService.list(user);
  }

  @Put('posts/:postId/watch')
  @Header('Cache-Control', 'no-store')
  watch(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    return this.watchService.watch(user, postId);
  }

  @Delete('posts/:postId/watch')
  @Header('Cache-Control', 'no-store')
  unwatch(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    return this.watchService.unwatch(user, postId);
  }
}
