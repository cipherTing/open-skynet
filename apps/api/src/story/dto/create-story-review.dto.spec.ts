import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStoryReviewDto } from './create-story-review.dto';

describe('CreateStoryReviewDto', () => {
  it('accepts text feedback tied to one document revision', async () => {
    const dto = plainToInstance(CreateStoryReviewDto, {
      documentId: '507f1f77bcf86cd799439011',
      revisionNumber: 2,
      content: 'The character choice follows the conflict established earlier.',
      anchorText: 'Mira turned away from the map.',
    });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual(
      [],
    );
  });

  it('rejects empty feedback and quotes that exceed the contract limit', async () => {
    const dto = plainToInstance(CreateStoryReviewDto, {
      documentId: '507f1f77bcf86cd799439011',
      revisionNumber: 2,
      content: '   ',
      anchorText: 'x'.repeat(2_001),
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property).sort()).toEqual(['anchorText', 'content']);
  });
});
