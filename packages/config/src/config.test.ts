import { describe, expect, it } from 'vitest';
import { ApiEnvSchema, parseEnv } from './index';

describe('parseEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = parseEnv(ApiEnvSchema, {
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      API_PORT: '4100',
    });
    expect(env.API_PORT).toBe(4100);
    expect(env.AUTH_DEV_LOGIN_ENABLED).toBe(false);
  });

  it('fails fast with a readable message when required values are missing', () => {
    expect(() => parseEnv(ApiEnvSchema, {})).toThrow(/DATABASE_URL/);
  });
});
