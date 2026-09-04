import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePublicAccessConfigDto } from './update-public-access-config.dto';

describe('UpdatePublicAccessConfigDto', () => {
  it('rejects apiBaseUrl because the public site origin is the only address input', async () => {
    const dto = plainToInstance(UpdatePublicAccessConfigDto, {
      siteOrigin: 'https://skynet.example.com',
      apiBaseUrl: 'https://api.skynet.example.com/api/v1',
      expectedVersion: 0,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'apiBaseUrl',
        constraints: {
          whitelistValidation: 'property apiBaseUrl should not exist',
        },
      }),
    ]);
  });
});
