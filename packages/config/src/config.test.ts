import { describe, expect, it, vi } from 'vitest';
import { ApiEnvSchema, parseEnv, loadApiEnv, loadRealtimeEnv } from './index';

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

it('refuses insecure production startup configurations', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost/test');
  vi.stubEnv('AUTH_DEV_LOGIN_ENABLED', 'true');
  try {
    expect(() => loadApiEnv()).toThrow('AUTH_DEV_LOGIN_ENABLED');
    vi.stubEnv('AUTH_DEV_LOGIN_ENABLED', 'false');
    vi.stubEnv('AUTH_PASSWORD_LOGIN_ENABLED', 'false');
    expect(() => loadApiEnv()).toThrow('Production needs');
    vi.stubEnv('AUTH_PASSWORD_LOGIN_ENABLED', 'true');
    vi.stubEnv('CORS_ORIGINS', 'https://game.example');
    vi.stubEnv('API_HOST', '127.0.0.1');
    expect(loadApiEnv().AUTH_PASSWORD_LOGIN_ENABLED).toBe(true);
    vi.stubEnv('CORS_ORIGINS', '');
    expect(() => loadApiEnv()).toThrow('Production needs');
    vi.stubEnv('CORS_ORIGINS', 'https://game.example');
    vi.stubEnv('API_HOST', '0.0.0.0');
    expect(() => loadApiEnv()).toThrow('Production needs');
    vi.stubEnv('REALTIME_HOST', '0.0.0.0');
    expect(() => loadRealtimeEnv()).toThrow('Production realtime');
  } finally {
    vi.unstubAllEnvs();
  }
});
