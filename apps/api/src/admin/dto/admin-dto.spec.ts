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
      titleZh: '   ',
      titleEn: 'Maintenance',
      bodyZh: '维护通知',
      bodyEn: 'Maintenance notice',
      kind: 'MAINTENANCE',
      startsAt: '2026-07-12T10:00:00.000Z',
      dismissible: true,
      reason: '创建维护公告',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'titleZh')).toBe(true);
  });
});
