import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListInvitationCodesDto } from './invitation-code.dto';

describe('ListInvitationCodesDto', () => {
  it('converts pagination query parameters to numbers', async () => {
    const dto = plainToInstance(ListInvitationCodesDto, {
      page: '2',
      pageSize: '20',
      status: 'USED',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(20);
  });
});
