import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TZDateMini } from '@date-fns/tz';
import {
  BUSINESS_CALENDAR_CONFIG_KEY,
  BusinessCalendarConfig,
  DEFAULT_BUSINESS_TIME_ZONE,
} from '@/database/schemas/business-calendar-config.schema';
import { systemErrors } from '@/common/errors/business-errors';

export interface BusinessCalendarConfigView {
  timeZone: string;
  version: number;
  updatedAt: string | null;
}

export interface BusinessDayWindow {
  dayKey: string;
  start: Date;
  end: Date;
}

function padCalendarPart(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDayKey(year: number, month: number, day: number): string {
  return `${year}-${padCalendarPart(month + 1)}-${padCalendarPart(day)}`;
}

@Injectable()
export class BusinessCalendarService implements OnModuleInit {
  private activeTimeZone = DEFAULT_BUSINESS_TIME_ZONE;
  private activeVersion = 0;

  constructor(
    @InjectModel(BusinessCalendarConfig.name)
    private readonly configModel: Model<BusinessCalendarConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    const config = await this.configModel
      .findOne({ key: BUSINESS_CALENDAR_CONFIG_KEY })
      .select('timeZone version');
    this.activeTimeZone = config
      ? this.normalizeTimeZone(config.timeZone)
      : DEFAULT_BUSINESS_TIME_ZONE;
    this.activeVersion = config?.version ?? 0;
  }

  getTimeZone(): string {
    return this.activeTimeZone;
  }

  getVersion(): number {
    return this.activeVersion;
  }

  getDayWindow(date = new Date()): BusinessDayWindow {
    const zonedDate = new TZDateMini(date.getTime(), this.activeTimeZone);
    return this.buildDayWindow(
      zonedDate.getFullYear(),
      zonedDate.getMonth(),
      zonedDate.getDate(),
    );
  }

  getRecentDayWindows(date: Date, count: number): BusinessDayWindow[] {
    const wholeCount = Math.floor(count);
    if (wholeCount < 1) throw new RangeError('Business day window count must be positive');
    const zonedDate = new TZDateMini(date.getTime(), this.activeTimeZone);
    const year = zonedDate.getFullYear();
    const month = zonedDate.getMonth();
    const day = zonedDate.getDate();
    return Array.from({ length: wholeCount }, (_, index) =>
      this.buildDayWindow(year, month, day - (wholeCount - index - 1)),
    );
  }

  getWeekKey(date = new Date()): string {
    const zonedDate = new TZDateMini(date.getTime(), this.activeTimeZone);
    const daysSinceMonday = (zonedDate.getDay() + 6) % 7;
    const monday = new TZDateMini(
      zonedDate.getFullYear(),
      zonedDate.getMonth(),
      zonedDate.getDate() - daysSinceMonday,
      this.activeTimeZone,
    );
    return formatDayKey(monday.getFullYear(), monday.getMonth(), monday.getDate());
  }

  async getAdminConfig(): Promise<BusinessCalendarConfigView> {
    const config = await this.configModel.findOne({ key: BUSINESS_CALENDAR_CONFIG_KEY });
    return config
      ? this.serialize(config)
      : {
          timeZone: DEFAULT_BUSINESS_TIME_ZONE,
          version: 0,
          updatedAt: null,
        };
  }

  normalizeTimeZone(value: string): string {
    const requested = value.trim();
    if (!requested) throw systemErrors.businessTimeZoneInvalid();
    try {
      return new Intl.DateTimeFormat('en', { timeZone: requested }).resolvedOptions().timeZone;
    } catch {
      throw systemErrors.businessTimeZoneInvalid();
    }
  }

  serialize(config: BusinessCalendarConfig): BusinessCalendarConfigView {
    return {
      timeZone: config.timeZone,
      version: config.version,
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  activate(config: BusinessCalendarConfigView): void {
    this.activeTimeZone = this.normalizeTimeZone(config.timeZone);
    this.activeVersion = config.version;
  }

  private buildDayWindow(year: number, month: number, day: number): BusinessDayWindow {
    const start = new TZDateMini(year, month, day, this.activeTimeZone);
    const end = new TZDateMini(year, month, day + 1, this.activeTimeZone);
    return {
      dayKey: formatDayKey(start.getFullYear(), start.getMonth(), start.getDate()),
      start: new Date(start.getTime()),
      end: new Date(end.getTime()),
    };
  }
}
