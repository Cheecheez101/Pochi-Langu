import type { Knex } from 'knex';
import { Money } from './money.js';

export type WithdrawalStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'requires_reconciliation'
  | 'requires_review'
  | 'cancelled';

export interface WithdrawalRecord {
  id: string;
  transactionId: string;
  userId: string;
  walletId: string;
  amountMinor: string;
  currency: 'KES';
  phoneE164: string;
  provider: string;
  providerReference: string | null;
  status: WithdrawalStatus;
  resultCode: number | null;
  resultDescription: string | null;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

type WithdrawalRow = {
  withdrawal_id: string;
  transaction_id: string;
  wallet_id: string;
  amount_minor: string;
  status: WithdrawalStatus;
};

function mapWithdrawal(row: Record<string, unknown>): WithdrawalRecord {
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
    status: row.status as WithdrawalStatus,
    resultCode: row.result_code === null ? null : Number(row.result_code),
    resultDescription: row.result_description ? String(row.result_description) : null,
    journalEntryId: row.journal_entry_id ? String(row.journal_entry_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function createWithdrawal(
  database: Knex,
  input: { userId: string; amount: Money; phone: string; idempotencyKey: string },
): Promise<WithdrawalRecord> {
  const result = await database.raw<{ rows: WithdrawalRow[] }>(
    'SELECT * FROM create_pending_withdrawal(?, ?, ?, ?, ?)',
    [input.userId, input.amount.minor.toString(), input.phone, input.idempotencyKey, 'daraja-sandbox'],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Withdrawal could not be created');
  if (row.status !== 'pending') {
    return getWithdrawal(database, input.userId, row.withdrawal_id);
  }

  // For sandbox, we simulate the withdrawal initiation
  // In production, this would call the B2C API
  // For now, we just record the withdrawal and wait for callback
  // The register_deposit_provider function is for deposits; we skip provider registration for withdrawals
  return getWithdrawal(database, input.userId, row.withdrawal_id);
}

export async function getWithdrawal(database: Knex, userId: string, withdrawalId: string): Promise<WithdrawalRecord> {
  const row = await database('withdrawals').where({ id: withdrawalId, user_id: userId }).first();
  if (!row) throw new Error('Withdrawal not found');
  return mapWithdrawal(row);
}

export async function listWithdrawals(database: Knex, userId: string): Promise<WithdrawalRecord[]> {
  const rows = await database('withdrawals').where({ user_id: userId }).orderBy('created_at', 'desc').limit(50);
  return rows.map(mapWithdrawal);
}

export async function applyWithdrawalResult(
  database: Knex,
  withdrawalId: string,
  input: {
    providerReference: string;
    status: WithdrawalStatus;
    resultCode: number | null;
    resultDescription: string;
    payload?: Record<string, unknown>;
  },
): Promise<WithdrawalRecord> {
  await database.raw(
    'SELECT * FROM apply_withdrawal_result(?, ?, ?::deposit_status, ?, ?, ?::jsonb)',
    [
      withdrawalId,
      input.providerReference,
      input.status,
      input.resultCode,
      input.resultDescription,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  const withdrawal = await database('withdrawals').where({ id: withdrawalId }).first();
  if (!withdrawal) throw new Error('Withdrawal result could not be loaded');
  return mapWithdrawal(withdrawal);
}