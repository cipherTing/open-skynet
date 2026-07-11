import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';

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
