import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { Public } from '@/auth/decorators/public.decorator';
import { RedisService } from '@/redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB database handle is not ready');
    }

    await database.admin().ping();

    await this.redisService.getClient().ping();

    return { status: 'ready' };
  }
}
