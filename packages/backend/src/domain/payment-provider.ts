import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

export type ProviderDepositStatus = 'succeeded' | 'failed';

export interface DepositInitiation {
  provider: 'daraja';
  providerReference: string;
  merchantRequestId: string;
  status: 'pending';
}

export interface DepositProvider {
  initiateDeposit(input: {
    depositId: string;
    phone: string;
    amountMinor: bigint;
  }): Promise<DepositInitiation>;
  parseCallback(input: unknown): {
    providerReference: string;
    status: ProviderDepositStatus;
    resultCode: number;
    resultDescription: string;
    payload: Record<string, unknown>;
  };
}

type DarajaTokenResponse = { access_token?: string; expires_in?: string };
type DarajaStkResponse = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
};

function timestamp(): string {
  const now = new Date();
  const parts = [
    now.getUTCFullYear().toString().padStart(4, '0'),
    (now.getUTCMonth() + 1).toString().padStart(2, '0'),
    now.getUTCDate().toString().padStart(2, '0'),
    now.getUTCHours().toString().padStart(2, '0'),
    now.getUTCMinutes().toString().padStart(2, '0'),
    now.getUTCSeconds().toString().padStart(2, '0'),
  ];
  return parts.join('');
}

function toDarajaPhone(phone: string): string {
  return phone.replace(/^\+/, '');
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Daraja configuration is missing ${name}`);
  return value;
}

export class DarajaSandboxProvider implements DepositProvider {
  private accessToken: { value: string; expiresAt: number } | null = null;

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 30_000) {
      return this.accessToken.value;
    }
    const key = required(env.DARAJA_CONSUMER_KEY, 'DARAJA_CONSUMER_KEY');
    const secret = required(env.DARAJA_CONSUMER_SECRET, 'DARAJA_CONSUMER_SECRET');
    const response = await fetch(
      `${env.DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` } },
    );
    if (!response.ok) throw new Error(`Daraja OAuth failed with HTTP ${response.status}`);
    const body = (await response.json()) as DarajaTokenResponse;
    if (!body.access_token) throw new Error('Daraja OAuth response did not contain an access token');
    const lifetime = Number(body.expires_in ?? 3600);
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + lifetime * 1000 };
    return body.access_token;
  }

  async initiateDeposit(input: {
    depositId: string;
    phone: string;
    amountMinor: bigint;
  }): Promise<DepositInitiation> {
    const shortCode = required(env.DARAJA_BUSINESS_SHORTCODE, 'DARAJA_BUSINESS_SHORTCODE');
    const passkey = required(env.DARAJA_PASSKEY, 'DARAJA_PASSKEY');
    const callbackUrl = required(env.DARAJA_CALLBACK_URL, 'DARAJA_CALLBACK_URL');
    const time = timestamp();
    const password = Buffer.from(`${shortCode}${passkey}${time}`).toString('base64');
    const phone = toDarajaPhone(input.phone);
    const response = await fetch(`${env.DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: time,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Number(input.amountMinor / 100n),
        PartyA: phone,
        PartyB: shortCode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: input.depositId,
        TransactionDesc: env.DARAJA_TRANSACTION_DESCRIPTION,
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'no response body');
      throw new Error(`Daraja STK Push failed with HTTP ${response.status}: ${errorBody}`);
    }
    const body = (await response.json()) as DarajaStkResponse;
    if (!body.CheckoutRequestID || !body.MerchantRequestID) {
      throw new Error(`Daraja STK Push was rejected: ${body.ResponseDescription ?? 'unknown response'}`);
    }
    return {
      provider: 'daraja',
      providerReference: body.CheckoutRequestID,
      merchantRequestId: body.MerchantRequestID,
      status: 'pending',
    };
  }

  parseCallback(input: unknown) {
    const callback = input as {
      Body?: {
        stkCallback?: {
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
        };
      };
    };
    const result = callback.Body?.stkCallback;
    if (!result?.CheckoutRequestID || typeof result.ResultCode !== 'number') {
      throw new Error('Invalid Daraja callback payload');
    }
    return {
      providerReference: result.CheckoutRequestID,
      status: result.ResultCode === 0 ? 'succeeded' : 'failed',
      resultCode: result.ResultCode,
      resultDescription: result.ResultDesc ?? 'Daraja callback received',
      payload: input as Record<string, unknown>,
    } as const;
  }
}

export const paymentProvider: DepositProvider = new DarajaSandboxProvider();

export function callbackFingerprint(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
