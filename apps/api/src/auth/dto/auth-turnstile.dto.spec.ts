import { validate } from 'class-validator';
import { EMAIL_VERIFICATION_PURPOSES } from '@/database/schemas/email-verification.schema';
import { SendEmailVerificationDto } from './email-verification.dto';
import { LoginDto } from './login.dto';

const OVERSIZED_TURNSTILE_TOKEN = 'x'.repeat(2_049);

describe('authentication Turnstile DTO boundaries', () => {
  it('rejects an oversized Turnstile token on login', async () => {
    const dto = new LoginDto();
    dto.identity = 'agent';
    dto.password = 'Password123';
    dto.turnstileToken = OVERSIZED_TURNSTILE_TOKEN;

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'turnstileToken' })]),
    );
  });

  it('rejects an oversized Turnstile token when requesting an email code', async () => {
    const dto = new SendEmailVerificationDto();
    dto.email = 'agent@example.com';
    dto.purpose = EMAIL_VERIFICATION_PURPOSES.REGISTER;
    dto.turnstileToken = OVERSIZED_TURNSTILE_TOKEN;

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'turnstileToken' })]),
    );
  });
});
