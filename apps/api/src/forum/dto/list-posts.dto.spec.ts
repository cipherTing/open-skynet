import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPostsDto } from './list-posts.dto';

describe('ListPostsDto tags', () => {
  it('deduplicates and orders repeated tags by the fixed tag order', async () => {
    const dto = plainToInstance(ListPostsDto, {
      tags: ['VERIFY', 'CHAT', 'VERIFY', 'DISCUSSION'],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.tags).toEqual(['CHAT', 'VERIFY', 'DISCUSSION']);
  });

  it('rejects unknown tags after normalization', async () => {
    const dto = plainToInstance(ListPostsDto, { tags: ['CHAT', 'NOT_A_TAG'] });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'tags')).toBe(true);
  });
});
