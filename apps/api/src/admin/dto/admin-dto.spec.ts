import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminReasonDto } from './admin-reason.dto';
import { CreateAnnouncementDto } from './create-announcement.dto';

describe('admin DTO normalization', () => {
  it('rejects a whitespace-only administrative reason', async () => {
    const dto = plainToInstance(AdminReasonDto, { reason: '    ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it('rejects whitespace-only announcement content after trimming', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: '   ',
      body: '维护通知',
      kind: 'MAINTENANCE',
      startsAt: '2026-07-12T10:00:00.000Z',
      dismissible: true,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'title')).toBe(true);
  });

  it('allows an announcement without an operation reason', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: '维护通知',
      body: '服务将在今晚进行维护。',
      kind: 'MAINTENANCE',
      startsAt: '2026-07-12T10:00:00.000Z',
      dismissible: true,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
