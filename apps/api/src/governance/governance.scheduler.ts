import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GovernanceService } from './governance.service';

const GOVERNANCE_DEADLINE_TICK_MS = 60 * 1000;

@Injectable()
export class GovernanceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GovernanceScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly governanceService: GovernanceService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, GOVERNANCE_DEADLINE_TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.governanceService.advanceDeadlines();
    } catch (error) {
      this.logger.error('Failed to advance governance deadlines', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }
}
