import type { Knex } from 'knex';
import { Money } from './money.js';
import { paymentProvider } from './payment-provider.js';

export type DepositStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'requires_reconciliation'
  | 'requires_review'
  | 'cancelled';

export interface DepositRecord {
  id: string;
  transactionId: string;
  userId: string;
  walletId: string;
  amountMinor: string;
  currency: 'KES';
  phoneE164: string;
  provider: string;
  providerReference: string | null;
  status: DepositStatus;
  resultCode: number | null;
  resultDescription: string | null;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

type DepositRow = {
  deposit_id: string;
  transaction_id: string;
  wallet_id: string;
  amount_minor: string;
  status: DepositStatus;
};

function mapDeposit(row: Record<string, unknown>): DepositRecord {
  return {
    id: String(row.id),
    transactionId: String(row.transaction_id),
    userId: String(row.user_id),
    walletId: String(row.wallet_id),
    amountMinor: String(row.amount_minor),
    currency: 'KES',
    phoneE164: String(row.phone_e164),
    provider: String(row.provider),
    providerReference: row.provider_reference ? String(row.provider_reference) : null,
    status: row.status as DepositStatus,
    resultCode: row.result_code === null ? null : Number(row.result_code),
    resultDescription: row.result_description ? String(row.result_description) : null,
    journalEntryId: row.journal_entry_id ? String(row.journal_entry_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function createDeposit(
  database: Knex,
  input: { userId: string; amount: Money; phone: string; idempotencyKey: string },
): Promise<DepositRecord> {
  const result = await database.raw<{ rows: DepositRow[] }>(
    'SELECT * FROM create_pending_deposit(?, ?, ?, ?, ?)',
    [input.userId, input.amount.minor.toString(), input.phone, input.idempotencyKey, 'daraja'],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Deposit could not be created');
  if (row.status !== 'pending') {
    return getDeposit(database, input.userId, row.deposit_id);
  }

  const provider = await paymentProvider.initiateDeposit({
    depositId: row.deposit_id,
    phone: input.phone,
    amountMinor: input.amount.minor,
  });
  await database.raw(
    'SELECT register_deposit_provider(?, ?, ?, ?)',
    [row.deposit_id, provider.provider, provider.merchantRequestId, provider.providerReference],
  );
  return getDeposit(database, input.userId, row.deposit_id);
}

export async function applyDepositResult(
  database: Knex,
  depositId: string,
  input: {
    providerReference: string;
    status: DepositStatus;
    resultCode: number | null;
    resultDescription: string;
    payload?: Record<string, unknown>;
  },
): Promise<DepositRecord> {
  await database.raw(
    'SELECT * FROM apply_deposit_result(?, ?, ?::deposit_status, ?, ?, ?::jsonb)',
    [
      depositId,
      input.providerReference,
      input.status,
      input.resultCode,
      input.resultDescription,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  const deposit = await database('deposits').where({ id: depositId }).first();
  if (!deposit) throw new Error('Deposit result could not be loaded');
  return mapDeposit(deposit);
}

export async function getDeposit(database: Knex, userId: string, depositId: string): Promise<DepositRecord> {
  const row = await database('deposits').where({ id: depositId, user_id: userId }).first();
  if (!row) throw new Error('Deposit not found');
  return mapDeposit(row);
}

export async function listDeposits(database: Knex, userId: string): Promise<DepositRecord[]> {
  const rows = await database('deposits').where({ user_id: userId }).orderBy('created_at', 'desc').limit(50);
  return rows.map(mapDeposit);
}
