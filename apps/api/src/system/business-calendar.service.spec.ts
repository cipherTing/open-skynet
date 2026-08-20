import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BusinessCalendarConfig } from '@/database/schemas/business-calendar-config.schema';
import { BusinessCalendarService } from './business-calendar.service';

interface BusinessDayWindow {
  dayKey: string;
  start: Date;
  end: Date;
}

type GetDayWindow = (date: Date) => BusinessDayWindow;
type GetRecentDayWindows = (date: Date, count: number) => BusinessDayWindow[];
type GetWeekKey = (date: Date) => string;

function isGetDayWindow(value: unknown): value is GetDayWindow {
  return typeof value === 'function';
}

function isGetRecentDayWindows(value: unknown): value is GetRecentDayWindows {
  return typeof value === 'function';
}

function isGetWeekKey(value: unknown): value is GetWeekKey {
  return typeof value === 'function';
}

describe('BusinessCalendarService', () => {
  let moduleRef: TestingModule;
  let service: BusinessCalendarService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        BusinessCalendarService,
        { provide: getModelToken(BusinessCalendarConfig.name), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BusinessCalendarService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('uses UTC as the default business day boundary', () => {
    const candidate: unknown = Reflect.get(service, 'getDayWindow');
    if (!isGetDayWindow(candidate)) {
      expect(typeof candidate).toBe('function');
      return;
    }

    const window = candidate.call(service, new Date('2026-08-19T23:30:00.000Z'));
    expect(window).toEqual({
      dayKey: '2026-08-19',
      start: new Date('2026-08-19T00:00:00.000Z'),
      end: new Date('2026-08-20T00:00:00.000Z'),
    });
  });

  it('honors an IANA zone and a daylight-saving transition', () => {
    service.activate({ timeZone: 'America/New_York', version: 1, updatedAt: null });
    const candidate: unknown = Reflect.get(service, 'getDayWindow');
    if (!isGetDayWindow(candidate)) {
      expect(typeof candidate).toBe('function');
      return;
    }

    const window = candidate.call(service, new Date('2026-03-08T12:00:00.000Z'));
    expect(window).toEqual({
      dayKey: '2026-03-08',
      start: new Date('2026-03-08T05:00:00.000Z'),
      end: new Date('2026-03-09T04:00:00.000Z'),
    });
  });

  it('builds contiguous recent business days across daylight-saving changes', () => {
    service.activate({ timeZone: 'America/New_York', version: 1, updatedAt: null });
    const candidate: unknown = Reflect.get(service, 'getRecentDayWindows');
    if (!isGetRecentDayWindows(candidate)) {
      expect(typeof candidate).toBe('function');
      return;
    }

    const windows = candidate.call(service, new Date('2026-03-09T12:00:00.000Z'), 2);
    expect(windows).toEqual([
      {
        dayKey: '2026-03-08',
        start: new Date('2026-03-08T05:00:00.000Z'),
        end: new Date('2026-03-09T04:00:00.000Z'),
      },
      {
        dayKey: '2026-03-09',
        start: new Date('2026-03-09T04:00:00.000Z'),
        end: new Date('2026-03-10T04:00:00.000Z'),
      },
    ]);
  });

  it('uses Monday as the start of the configured business week', () => {
    service.activate({ timeZone: 'America/New_York', version: 1, updatedAt: null });
    const candidate: unknown = Reflect.get(service, 'getWeekKey');
    if (!isGetWeekKey(candidate)) {
      expect(typeof candidate).toBe('function');
      return;
    }

    expect(candidate.call(service, new Date('2026-03-08T12:00:00.000Z'))).toBe('2026-03-02');
  });
});
