import { SetMetadata } from '@nestjs/common';

export const PRE_AUTH_THROTTLE_KEY = 'security:pre-auth-throttle';

export const PreAuthThrottle = () => SetMetadata(PRE_AUTH_THROTTLE_KEY, true);
