import { syncDatabaseIndexes } from './database-indexes';

describe('syncDatabaseIndexes', () => {
  it('blocks index drops unless explicitly allowed', async () => {
    const syncIndexes = jest.fn().mockResolvedValue(['legacy_index']);
    const models = {
      Example: {
        diffIndexes: jest.fn().mockResolvedValue({
          toCreate: [{ name: 'new_index' }],
          toDrop: ['legacy_index'],
        }),
        syncIndexes,
      },
    };
    const connection = {
      readyState: 1,
      models,
      model: jest.fn(),
    };

    await expect(
      syncDatabaseIndexes(connection as never, [{ name: 'Example', schema: {} as never }]),
    ).rejects.toThrow('Database index drops are blocked by default');
    expect(syncIndexes).not.toHaveBeenCalled();
  });

  it('synchronizes declared indexes after explicit drop approval', async () => {
    const dropIndex = jest.fn().mockResolvedValue(undefined);
    const models = {
      Example: {
        diffIndexes: jest.fn().mockResolvedValue({
          toCreate: [{ name: 'new_index' }],
          toDrop: ['legacy_index'],
        }),
        collection: { dropIndex },
        createIndexes: jest.fn(),
      },
    };

    await expect(
      syncDatabaseIndexes(
        { readyState: 1, models, model: jest.fn() } as never,
        [{ name: 'Example', schema: {} as never }],
        { allowDrop: true },
      ),
    ).resolves.toEqual([{ model: 'Example', created: ['new_index'], dropped: ['legacy_index'] }]);
    expect(dropIndex).toHaveBeenCalledWith('legacy_index');
  });

  it('refuses to run when MongoDB is not connected', async () => {
    await expect(
      syncDatabaseIndexes({ readyState: 0, models: {}, model: jest.fn() } as never, []),
    ).rejects.toThrow('MongoDB connection is not ready');
  });

  it('reports unnamed indexes with a stable key description', async () => {
    const createIndexes = jest.fn().mockResolvedValue([]);
    const models = {
      Example: {
        diffIndexes: jest.fn().mockResolvedValue({
          toCreate: [{ key: { fieldA: 1, fieldB: -1 } }],
          toDrop: [],
        }),
        createIndexes,
      },
    };

    await expect(
      syncDatabaseIndexes(
        { readyState: 1, models, model: jest.fn() } as never,
        [{ name: 'Example', schema: {} as never }],
      ),
    ).resolves.toEqual([
      {
        model: 'Example',
        created: ['{"fieldA":1,"fieldB":-1}'],
        dropped: [],
      },
    ]);
    expect(createIndexes).toHaveBeenCalledTimes(1);
  });
});
