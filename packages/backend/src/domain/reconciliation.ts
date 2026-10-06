import type { Knex } from 'knex';

export interface ReconciliationStatus {
  providerReference: string;
  status: 'succeeded' | 'failed' | 'requires_reconciliation' | 'requires_review' | 'cancelled';
  resultCode: number;
  resultDescription: string;
  payload?: Record<string, unknown>;
}

export interface ReconciliationResult {
  reconciled: boolean;
  deposit: Record<string, unknown> | null;
  error: string | null;
}

export async function reconcileDeposit(
  database: Knex,
  depositId: string
): Promise<ReconciliationResult> {
  const deposit = await database('deposits').where({ id: depositId }).first();
  if (!deposit) return { reconciled: false, deposit: null, error: 'Deposit not found' };

  if (deposit.status === 'succeeded' && deposit.journal_entry_id) {
    return { reconciled: true, deposit, error: null };
  }

  const providerRef = deposit.provider_reference || '';

  const existingEvents = await database('deposit_reconciliation_events')
    .where({ deposit_id: depositId })
    .orderBy('created_at', 'desc')
    .limit(1);

  if (existingEvents.length > 0) {
    const lastEvent = existingEvents[0];
    if (lastEvent.observed_status === 'succeeded' && deposit.journal_entry_id) {
      return { reconciled: true, deposit, error: null };
    }
  }

  return {
    reconciled: false,
    deposit,
    error: `Transaction ${providerRef} pending reconciliation - no active provider configured. Use Daraja API to query status.`,
  };
}

export async function reconcileMissingDeposit(
  database: Knex,
  depositId: string,
  receiptNumber: string
): Promise<ReconciliationResult> {
  const deposit = await database('deposits')
    .where(function () {
      this.where('provider_reference', receiptNumber).orWhere('receipt_number', receiptNumber);
    })
    .first();

  if (!deposit) {
    return { reconciled: false, deposit: null, error: 'No deposit found with receipt number ' + receiptNumber };
  }

  if (deposit.status === 'succeeded' && deposit.journal_entry_id) {
    return { reconciled: true, deposit, error: null };
  }

  try {
    const params = [
      deposit.id,
      deposit.provider_reference,
      'succeeded',
      0,
      'Reconciled via receipt number',
      JSON.stringify({}),
    ];
    const result = await database.raw(
      'SELECT * FROM apply_deposit_result(?, ?, ?::deposit_status, ?, ?, ?::jsonb)',
      params
    );

    const updatedDeposit = result.rows[0];
    return { reconciled: true, deposit: updatedDeposit, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('already')) {
      return { reconciled: true, deposit, error: null };
    }
    return { reconciled: false, deposit, error: message };
  }
}