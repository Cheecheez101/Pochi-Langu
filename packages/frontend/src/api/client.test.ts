import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses an included-credentials request for login', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'user-1', phone: '+254712345678' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await api.login('0712345678', 'correct horse battery');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({ phone: '0712345678', password: 'correct horse battery' }),
      }),
    );
  });

  it('surfaces an API error message and status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 }),
    );

    await expect(api.login('0712345678', 'incorrect password')).rejects.toMatchObject({
      message: 'Invalid credentials',
      status: 401,
    });
  });

  it('keeps wallet and deposit amounts as minor-unit strings', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ wallet: { availableMinor: '12500' }, deposits: [] }), { status: 200 }),
    );

    const wallet = await api.getWallet();
    expect(wallet.wallet.availableMinor).toBe('12500');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/wallet', expect.objectContaining({ credentials: 'include' }));
  });
});
