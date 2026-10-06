import { describe, expect, it } from 'vitest';
import { DarajaSandboxProvider } from '../domain/payment-provider.js';

describe('Daraja sandbox provider boundary', () => {
  it('parses a successful real callback into a settlement result', () => {
    const provider = new DarajaSandboxProvider();
    expect(provider.parseCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_123',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
        },
      },
    })).toMatchObject({
      providerReference: 'ws_CO_123',
      status: 'succeeded',
      resultCode: 0,
    });
  });

  it('parses a failed callback without crediting the wallet', () => {
    const provider = new DarajaSandboxProvider();
    expect(provider.parseCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_CO_456',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user',
        },
      },
    })).toMatchObject({
      providerReference: 'ws_CO_456',
      status: 'failed',
      resultCode: 1032,
    });
  });

  it('rejects malformed callbacks', () => {
    const provider = new DarajaSandboxProvider();
    expect(() => provider.parseCallback({})).toThrow('Invalid Daraja callback payload');
  });
});
