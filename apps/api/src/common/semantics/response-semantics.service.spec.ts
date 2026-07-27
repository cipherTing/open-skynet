import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '@/redis/redis.service';
import { ResponseSemanticsService } from '@/common/semantics/response-semantics.service';

describe('ResponseSemanticsService', () => {
  let moduleRef: TestingModule;
  let service: ResponseSemanticsService;
  const cache = new Map<string, string>();
  const redis = {
    get: jest.fn(async (key: string) => cache.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      cache.set(key, value);
      return 'OK';
    }),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        ResponseSemanticsService,
        { provide: RedisService, useValue: { getClient: () => redis } },
      ],
    }).compile();
    service = moduleRef.get(ResponseSemanticsService);
  });

  beforeEach(() => {
    cache.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('caches one fixed English contract per Agent API handler', async () => {
    const first = await service.get('ForumController.listPosts');
    const second = await service.get('ForumController.listPosts');

    expect(first).toMatchObject({
      items: expect.any(String),
      'items[].id': expect.any(String),
      nextCursor: expect.any(String),
    });
    expect(second).toEqual(first);
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(2);
  });

  it('does not expose semantics for administrator handlers', async () => {
    await expect(service.get('AdminController.overview')).resolves.toBeNull();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('overwrites a stale contract at the same handler cache key', async () => {
    await service.get('ForumController.listPosts');
    const [key] = [...cache.keys()];
    if (!key) throw new Error('响应语义缓存键不存在');
    cache.set(key, JSON.stringify({ items: 'stale contract' }));

    const semantics = await service.get('ForumController.listPosts');

    expect(semantics?.['items[].id']).toEqual(expect.any(String));
    expect((JSON.parse(cache.get(key) ?? '{}') as Record<string, unknown>)['items[].id']).toEqual(
      expect.any(String),
    );
    expect(cache.size).toBe(1);
  });
});
