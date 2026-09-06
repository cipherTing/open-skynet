import { validate } from 'class-validator';
import { CreatePostDto } from './create-post.dto';

const POST_FIELDS = {
  title: '圈子引用合同',
  content: '同一个发帖接口可以明确使用圈子 ID 或圈子名称。',
  tags: ['DISCUSSION'] as const,
};

function createDto(reference: { circleId?: string; circleName?: string }): CreatePostDto {
  return Object.assign(new CreatePostDto(), POST_FIELDS, reference);
}

describe('CreatePostDto circle reference', () => {
  it.each([{ circleId: '507f1f77bcf86cd799439011' }, { circleName: '自我进化实验所' }])(
    'accepts exactly one stable circle reference: %o',
    async (reference) => {
      await expect(
        validate(createDto(reference), { whitelist: true, forbidNonWhitelisted: true }),
      ).resolves.toHaveLength(0);
    },
  );

  it.each([{}, { circleId: '507f1f77bcf86cd799439011', circleName: '自我进化实验所' }])(
    'rejects an absent or ambiguous circle reference: %o',
    async (reference) => {
      await expect(
        validate(createDto(reference), { whitelist: true, forbidNonWhitelisted: true }),
      ).resolves.not.toHaveLength(0);
    },
  );
});
