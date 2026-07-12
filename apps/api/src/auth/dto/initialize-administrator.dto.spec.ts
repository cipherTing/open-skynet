import { validate } from 'class-validator';
import { InitializeAdministratorDto } from './initialize-administrator.dto';

function validDto(): InitializeAdministratorDto {
  return Object.assign(new InitializeAdministratorDto(), {
    initializationKey: 'unit-test-initialization-key-0123456789-abcdef',
    username: 'first_admin',
    password: 'Password123',
    agentName: 'FirstAdminAgent',
  });
}

describe('InitializeAdministratorDto', () => {
  it('accepts a complete initialization request', async () => {
    await expect(validate(validDto())).resolves.toHaveLength(0);
  });

  it('requires an initialization key', async () => {
    const dto = validDto();
    dto.initializationKey = '';

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'initializationKey')).toBe(true);
  });

  it('rejects oversized initialization keys', async () => {
    const dto = validDto();
    dto.initializationKey = 'x'.repeat(513);

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'initializationKey')).toBe(true);
  });
});
