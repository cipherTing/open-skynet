import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeStoryDocumentStateDto } from './change-story-document-state.dto';
import { CreateStoryDto } from './create-story.dto';
import { CreateStoryDocumentDto } from './create-story-document.dto';
import { CreateStoryDiscussionDto } from './create-story-discussion.dto';
import { CreateStoryDiscussionMessageDto } from './create-story-discussion-message.dto';
import { CreateStoryReviewDto } from './create-story-review.dto';
import { RestoreStoryDocumentDto } from './restore-story-document.dto';
import { ReviseStoryDto } from './revise-story.dto';
import { ReviseStoryDocumentDto } from './revise-story-document.dto';

const documentId = '507f1f77bcf86cd799439011';
const revisionInput = { expectedVersion: 1, changeSummary: 'Check the boundary.' };
const documentInput = {
  kind: 'world_setting',
  title: 'An unfinished place',
  content: '',
  changeSummary: 'Create an outline.',
};

describe('story write input boundaries', () => {
  it.each([
    ['Chinese text', '潮'.repeat(60_000)],
    ['supplementary characters', '🌊'.repeat(60_000)],
  ])('accepts more than 50000 %s within the HTTP byte budget', async (_name, content) => {
    expect(Buffer.byteLength(JSON.stringify({ ...documentInput, content }), 'utf8')).toBeLessThan(
      1_048_576,
    );
    for (const dto of [
      plainToInstance(CreateStoryDocumentDto, { ...documentInput, content }),
      plainToInstance(ReviseStoryDocumentDto, { ...revisionInput, content }),
    ]) {
      await expect(validate(dto)).resolves.toEqual([]);
    }
  });

  it.each(['kind', 'title', 'content', 'links'])(
    'rejects null document %s before writing',
    async (field) => {
      const dto = plainToInstance(ReviseStoryDocumentDto, { ...revisionInput, [field]: null });
      expect((await validate(dto)).map((error) => error.property)).toContain(field);
    },
  );

  it.each(['title', 'premise', 'phase', 'openQuestions'])(
    'rejects null opening %s before writing',
    async (field) => {
      const dto = plainToInstance(ReviseStoryDto, { ...revisionInput, [field]: null });
      expect((await validate(dto)).map((error) => error.property)).toContain(field);
    },
  );

  it('rejects a null question list when starting a story', async () => {
    const dto = plainToInstance(CreateStoryDto, {
      title: 'A story',
      premise: 'A letter arrives.',
      openQuestions: null,
    });
    expect((await validate(dto)).map((error) => error.property)).toContain('openQuestions');
  });

  it.each([
    null,
    [],
    [{ currentStartLine: 1, currentEndLine: 1, targetStartLine: 1, targetEndLine: 1 }],
  ])('rejects a non-object restoration selection: %j', async (selection) => {
    const dto = plainToInstance(RestoreStoryDocumentDto, {
      ...revisionInput,
      targetRevisionNumber: 1,
      selection,
    });
    expect((await validate(dto)).map((error) => error.property)).toContain('selection');
  });

  it.each([null, [null], [[]], [[{ targetDocumentId: documentId, relation: 'references' }]]])(
    'rejects a non-object link list: %j',
    async (links) => {
      for (const dto of [
        plainToInstance(CreateStoryDocumentDto, { ...documentInput, links }),
        plainToInstance(ReviseStoryDocumentDto, { ...revisionInput, links }),
      ]) {
        expect((await validate(dto)).map((error) => error.property)).toContain('links');
      }
    },
  );

  it('rejects null optional version, discussion quote and reply target', async () => {
    const inputs = [
      {
        dto: plainToInstance(ChangeStoryDocumentStateDto, {
          ...revisionInput,
          expectedStructureVersion: null,
        }),
        field: 'expectedStructureVersion',
      },
      {
        dto: plainToInstance(CreateStoryDocumentDto, {
          ...documentInput,
          expectedStructureVersion: null,
        }),
        field: 'expectedStructureVersion',
      },
      {
        dto: plainToInstance(CreateStoryDiscussionDto, {
          targetType: 'story',
          documentId: null,
          revisionNumber: 1,
          title: 'Question',
          content: 'Who wrote the letter?',
          anchorText: null,
        }),
        field: 'anchorText',
      },
      {
        dto: plainToInstance(CreateStoryDiscussionMessageDto, {
          content: 'A reply.',
          parentMessageId: null,
        }),
        field: 'parentMessageId',
      },
    ];
    for (const { dto, field } of inputs) {
      expect((await validate(dto)).map((error) => error.property)).toContain(field);
    }
  });

  it('accepts valid link objects and still rejects duplicate target/relation pairs', async () => {
    const link = { targetDocumentId: documentId, relation: 'references' };
    const valid = plainToInstance(CreateStoryDocumentDto, { ...documentInput, links: [link] });
    await expect(validate(valid)).resolves.toEqual([]);
    const duplicate = plainToInstance(CreateStoryDocumentDto, {
      ...documentInput,
      links: [link, { ...link }],
    });
    expect((await validate(duplicate)).map((error) => error.property)).toContain('links');
  });

  it('accepts omission, intentional null values, empty text and a real selection object', async () => {
    const inputs = [
      plainToInstance(ReviseStoryDocumentDto, { ...revisionInput, content: '', links: [] }),
      plainToInstance(CreateStoryDocumentDto, { ...documentInput, links: [] }),
      plainToInstance(CreateStoryDocumentDto, {
        ...documentInput,
        kind: 'chapter',
        expectedStructureVersion: 1,
        parentDocumentId: null,
        afterDocumentId: null,
      }),
      plainToInstance(ReviseStoryDto, {
        ...revisionInput,
        genre: null,
        tone: null,
        viewpoint: null,
        targetLength: null,
        establishedDirection: null,
        openQuestions: [],
      }),
      plainToInstance(RestoreStoryDocumentDto, { ...revisionInput, targetRevisionNumber: 1 }),
      plainToInstance(RestoreStoryDocumentDto, {
        ...revisionInput,
        targetRevisionNumber: 1,
        selection: { currentStartLine: 1, currentEndLine: 2, targetStartLine: 1, targetEndLine: 1 },
      }),
      plainToInstance(CreateStoryReviewDto, {
        targetType: 'story',
        documentId: null,
        revisionNumber: 1,
        content: 'An observation.',
        anchorText: null,
      }),
      plainToInstance(CreateStoryDiscussionDto, {
        targetType: 'story',
        documentId: null,
        revisionNumber: 1,
        title: 'Question',
        content: 'Who wrote the letter?',
        addressedAgentId: null,
      }),
    ];
    for (const dto of inputs) await expect(validate(dto)).resolves.toEqual([]);
  });
});
