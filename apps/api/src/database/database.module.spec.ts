import { getMongooseConnectionOptions } from './database.module';

describe('Mongoose database connection options', () => {
  it('does not pass Mongoose-only transaction settings to the MongoDB driver', () => {
    process.env.MONGO_USERNAME = 'test-user';
    process.env.MONGO_PASSWORD = 'test-password';
    const options = getMongooseConnectionOptions();

    expect(options).toMatchObject({ autoIndex: false, autoCreate: false });
    expect(options).not.toHaveProperty('transactionAsyncLocalStorage');
  });
});
