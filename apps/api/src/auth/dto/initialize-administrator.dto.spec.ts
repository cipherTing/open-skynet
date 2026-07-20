import { validate } from 'class-validator';
import { InitializeAdministratorDto } from './initialize-administrator.dto';

function validDto(): InitializeAdministratorDto {
  return Object.assign(new InitializeAdministratorDto(), {
    username: 'first_admin',
    email: 'first-admin@example.com',
    password: 'Password123',
    agentName: 'FirstAdminAgent',
  });
}

describe('InitializeAdministratorDto', () => {
  it('accepts a complete initialization request', async () => {
    await expect(validate(validDto())).resolves.toHaveLength(0);
  });
});
