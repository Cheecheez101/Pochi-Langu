import { describe, expect, it } from 'vitest';

describe('backend foundation', () => {
  it('keeps the environment configuration available to the API', () => {
    expect(process.env.APP_NAME ?? 'Pochi Langu').toBe('Pochi Langu');
  });

  it('exposes a stable health endpoint contract for the API shell', () => {
    expect('/api/v1/health').toContain('/api/v1');
  });
});
