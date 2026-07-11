import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  check() {
    return this.healthService.live();
  }

  @Public()
  @Get('live')
  live() {
    return this.healthService.live();
  }

  @Public()
  @Get('ready')
  ready() {
    return this.healthService.ready();
  }
}
