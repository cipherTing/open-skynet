import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { createConnection, type Connection, type ClientSession } from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { DatabaseService } from './database.service';

jest.setTimeout(120_000);

describe('DatabaseService transactions', () => {
  let moduleRef: TestingModule;
  let service: DatabaseService;
  let transaction: jest.Mock;

  beforeEach(async () => {
    transaction = jest.fn();
    moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: getConnectionToken(),
          useValue: {
            readyState: 1,
            db: {
              admin: () => ({
                command: jest.fn().mockResolvedValue({ setName: 'rs0' }),
              }),
            },
            transaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(DatabaseService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('delegates replica-set transactions to Mongoose', async () => {
    transaction.mockResolvedValue('committed');

    await expect(service.$transaction(async () => 'committed')).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it('retries optimistic concurrency failures up to three attempts', async () => {
    const versionError = new Error('document version changed');
    versionError.name = 'VersionError';
    transaction
      .mockRejectedValueOnce(versionError)
      .mockRejectedValueOnce(versionError)
      .mockResolvedValueOnce('committed');

    await expect(service.$transaction(async () => 'committed')).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry unrelated transaction failures', async () => {
    transaction.mockRejectedValue(new Error('permanent failure'));

    await expect(service.$transaction(async () => 'unreachable')).rejects.toThrow(
      'permanent failure',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('DatabaseService required transactions', () => {
  const collectionName = 'required_transaction_records';
  let replicaSet: MongoMemoryReplSet | undefined;
  let standalone: MongoMemoryServer | undefined;
  let replicaSetConnection: Connection | undefined;
  let standaloneConnection: Connection | undefined;
  let replicaSetService: DatabaseService;
  let standaloneService: DatabaseService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    replicaSetConnection = await createConnection(replicaSet.getUri()).asPromise();
    replicaSetService = new DatabaseService(replicaSetConnection);

    standalone = await MongoMemoryServer.create();
    standaloneConnection = await createConnection(standalone.getUri()).asPromise();
    standaloneService = new DatabaseService(standaloneConnection);
  });

  beforeEach(async () => {
    await replicaSetConnection?.db?.collection(collectionName).deleteMany({});
    await standaloneConnection?.db?.collection(collectionName).deleteMany({});
  });

  afterAll(async () => {
    await replicaSetConnection?.close();
    await standaloneConnection?.close();
    if (replicaSet) await replicaSet.stop();
    if (standalone) await standalone.stop();
  });

  it('commits writes on a replica set and returns the callback result', async () => {
    const database = replicaSetConnection?.db;
    if (!database) throw new Error('Replica-set test database is unavailable');

    await expect(
      replicaSetService.$requiredTransaction(async (session) => {
        await database.collection(collectionName).insertOne(
          { result: 'committed' },
          { session },
        );
        return 'committed';
      }),
    ).resolves.toBe('committed');

    await expect(
      database.collection(collectionName).findOne({ result: 'committed' }),
    ).resolves.not.toBeNull();
  });

  it('rolls back replica-set writes when the callback fails', async () => {
    const database = replicaSetConnection?.db;
    if (!database) throw new Error('Replica-set test database is unavailable');
    const failure = new Error('required transaction callback failed');

    await expect(
      replicaSetService.$requiredTransaction(async (session) => {
        await database.collection(collectionName).insertOne(
          { result: 'rolled-back' },
          { session },
        );
        throw failure;
      }),
    ).rejects.toBe(failure);

    await expect(
      database.collection(collectionName).findOne({ result: 'rolled-back' }),
    ).resolves.toBeNull();
  });

  it('rejects standalone MongoDB before invoking the callback', async () => {
    const callback = jest.fn(
      async (_session: ClientSession): Promise<string> => 'unreachable',
    );

    await expect(
      standaloneService.$requiredTransaction(callback),
    ).rejects.toThrow('MongoDB replica set is required for this transaction');
    expect(callback).not.toHaveBeenCalled();
  });
});
