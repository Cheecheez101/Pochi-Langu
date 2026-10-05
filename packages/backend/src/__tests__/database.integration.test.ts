import { randomUUID } from 'node:crypto';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseConfig, getMigrationDatabaseConfig } from '../config/database.js';

const database = knex(getMigrationDatabaseConfig());
const appDatabase = knex(databaseConfig);

async function createUserWallet() {
  const userId = randomUUID();
  const walletId = randomUUID();
  await database('users').insert({ id: userId, phone_e164: `+254${Date.now()}${Math.floor(Math.random() * 1000)}` });
  await database('wallets').insert({ id: walletId, user_id: userId });
  return { userId, walletId };
}

async function createBalancedEntry(accountId: string, sourceType: string, reversalOfEntryId?: string) {
  const entryId = randomUUID();
  await database.transaction(async (trx: Knex.Transaction) => {
    await trx('journal_entries').insert({
      id: entryId,
      entry_kind: reversalOfEntryId ? 'reversal' : 'original',
      source_type: sourceType,
      source_reference: randomUUID(),
      reversal_of_entry_id: reversalOfEntryId ?? null,
      description: 'integration test entry',
    });
    await trx('journal_lines').insert([
      { journal_entry_id: entryId, ledger_account_id: accountId, debit_minor: 100, credit_minor: 0 },
      { journal_entry_id: entryId, ledger_account_id: accountId, debit_minor: 0, credit_minor: 100 },
    ]);
  });
  return entryId;
}

async function asAppRole<T>(callback: (trx: Knex.Transaction) => Promise<T>) {
  return appDatabase.transaction(async (trx) => {
    return callback(trx);
  });
}

describe('Section 28 PostgreSQL foundation', () => {
  beforeAll(async () => {
    await database.migrate.latest();
  });

  afterAll(async () => {
    await database.destroy();
    await appDatabase.destroy();
  });

  it('enforces KES, bigint projection amounts, and non-negative wallet balances', async () => {
    const { userId } = await createUserWallet();
    await expect(database('wallets').where({ user_id: userId }).update({ available_minor: -1 })).rejects.toThrow();
    await expect(database('wallets').insert({ user_id: randomUUID(), currency: 'USD' })).rejects.toThrow();
    await expect(database('vaults').insert({
      user_id: userId,
      name: 'negative',
      target_minor: -1,
    })).rejects.toThrow();
  });

  it('rejects duplicate idempotency and provider identifiers', async () => {
    const { userId, walletId } = await createUserWallet();
    const suffix = randomUUID();
    const base = {
      user_id: userId,
      wallet_id: walletId,
      type: 'deposit',
      status: 'pending',
      amount_minor: 100,
      idempotency_key: `same-request-${suffix}`,
      merchant_request_id: `merchant-${suffix}`,
      checkout_request_id: `checkout-${suffix}`,
      receipt_number: `receipt-${suffix}`,
    };
    await database('transactions').insert(base);
    await expect(database('transactions').insert(base)).rejects.toThrow();
    await expect(database('transactions').insert({
      ...base,
      idempotency_key: 'different-request',
    })).rejects.toThrow();
    await expect(database('transactions').insert({
      ...base,
      idempotency_key: 'different-request-2',
      merchant_request_id: 'merchant-2',
    })).rejects.toThrow();
  });

  it('rejects invalid transaction status transitions', async () => {
    const { userId, walletId } = await createUserWallet();
    await database('transactions').insert({
      user_id: userId,
      wallet_id: walletId,
      type: 'deposit',
      status: 'pending',
      amount_minor: 100,
      idempotency_key: `status-transition-${randomUUID()}`,
    });
    await expect(database('transactions').where({ user_id: userId }).update({ status: 'succeeded' }))
      .rejects.toThrow();
    await database('transactions').where({ user_id: userId }).update({ status: 'processing' });
    await database('transactions').where({ user_id: userId }).update({ status: 'requires_reconciliation' });
  });

  it('rejects unbalanced and zero-line journal entries at commit', async () => {
    const { userId, walletId } = await createUserWallet();
    const accountId = randomUUID();
    await database('ledger_accounts').insert({ id: accountId, account_type: 'wallet', user_id: userId, wallet_id: walletId });

    await expect(database.transaction(async (trx) => {
      await trx('journal_entries').insert({
        source_type: 'unbalanced',
        source_reference: randomUUID(),
        description: 'must fail at commit',
      });
      await trx('journal_lines').insert({
        ledger_account_id: accountId,
        debit_minor: 100,
        credit_minor: 0,
      });
    })).rejects.toThrow();

    await expect(database.transaction(async (trx) => {
      await trx('journal_entries').insert({
        source_type: 'zero-lines',
        source_reference: randomUUID(),
        description: 'must fail at commit',
      });
    })).rejects.toThrow();
  });

  it('rejects UPDATE, DELETE, and TRUNCATE as the application role', async () => {
    const { userId, walletId } = await createUserWallet();
    const accountId = randomUUID();
    await database('ledger_accounts').insert({ id: accountId, account_type: 'wallet', user_id: userId, wallet_id: walletId });
    const entryId = await createBalancedEntry(accountId, 'append-only');

    await expect(asAppRole((trx) => trx('journal_entries').where({ id: entryId }).update({ description: 'rewrite' })))
      .rejects.toThrow();
    await expect(asAppRole((trx) => trx('journal_entries').where({ id: entryId }).del()))
      .rejects.toThrow();
    await expect(asAppRole((trx) => trx.raw('TRUNCATE journal_lines')))
      .rejects.toThrow();
    await expect(asAppRole((trx) => trx('wallets').where({ id: walletId }).update({ available_minor: 1 })))
      .rejects.toThrow();
    await expect(asAppRole((trx) => trx('ledger_accounts').where({ id: accountId }).update({ balance_minor: 1 })))
      .rejects.toThrow();
    await expect(asAppRole((trx) => trx('journal_entries').insert({
      source_type: 'app-direct',
      source_reference: randomUUID(),
      description: 'must fail',
    }))).rejects.toThrow();
  });

  it('accepts a reversal linked through reversal_of_entry_id', async () => {
    const { userId, walletId } = await createUserWallet();
    const accountId = randomUUID();
    await database('ledger_accounts').insert({ id: accountId, account_type: 'wallet', user_id: userId, wallet_id: walletId });
    const originalId = await createBalancedEntry(accountId, 'original');
    const reversalId = await createBalancedEntry(accountId, 'reversal', originalId);
    const reversal = await database('journal_entries').where({ id: reversalId, reversal_of_entry_id: originalId });
    expect(reversal).toHaveLength(1);
    await expect(createBalancedEntry(accountId, 'reversal-again', originalId)).rejects.toThrow();
  });

  it('rejects reversal targets that are missing or are themselves reversals', async () => {
    const { userId, walletId } = await createUserWallet();
    const accountId = randomUUID();
    await database('ledger_accounts').insert({ id: accountId, account_type: 'wallet', user_id: userId, wallet_id: walletId });
    const originalId = await createBalancedEntry(accountId, 'reversal-target');
    const reversalId = await createBalancedEntry(accountId, 'reversal-target-reversal', originalId);
    await expect(createBalancedEntry(accountId, 'missing-target', randomUUID())).rejects.toThrow();
    await expect(createBalancedEntry(accountId, 'reverse-reversal', reversalId)).rejects.toThrow();
  });

  it('rejects owner-role journal entries mixing accounts from different users at commit', async () => {
    const first = await createUserWallet();
    const second = await createUserWallet();
    const firstAccount = randomUUID();
    const secondAccount = randomUUID();
    await database('ledger_accounts').insert([
      { id: firstAccount, account_type: 'wallet', user_id: first.userId, wallet_id: first.walletId },
      { id: secondAccount, account_type: 'wallet', user_id: second.userId, wallet_id: second.walletId },
    ]);
    await expect(database.transaction(async (trx) => {
      const entryId = randomUUID();
      await trx('journal_entries').insert({
        id: entryId,
        source_type: 'mixed-users',
        source_reference: randomUUID(),
        description: 'must fail at commit',
      });
      await trx('journal_lines').insert([
        { journal_entry_id: entryId, ledger_account_id: firstAccount, debit_minor: 100, credit_minor: 0 },
        { journal_entry_id: entryId, ledger_account_id: secondAccount, debit_minor: 0, credit_minor: 100 },
      ]);
    })).rejects.toThrow();
  });

  it('rejects journal lines for closed wallets', async () => {
    const { userId, walletId } = await createUserWallet();
    const accountId = randomUUID();
    await database('ledger_accounts').insert({ id: accountId, account_type: 'wallet', user_id: userId, wallet_id: walletId });
    await database('wallets').where({ id: walletId }).update({ status: 'closed' });
    await expect(database.transaction(async (trx) => {
      const entryId = randomUUID();
      await trx('journal_entries').insert({
        id: entryId,
        source_type: 'closed-wallet',
        source_reference: randomUUID(),
        description: 'must fail',
      });
      await trx('journal_lines').insert({
        journal_entry_id: entryId,
        ledger_account_id: accountId,
        debit_minor: 100,
        credit_minor: 0,
      });
    })).rejects.toThrow();
  });

  it('enforces the approved vault state transitions', async () => {
    const { userId } = await createUserWallet();
    const unlockedVaultId = randomUUID();
    await database('vaults').insert({ id: unlockedVaultId, user_id: userId, name: 'unlocked', target_minor: 100 });
    await database('vaults').where({ id: unlockedVaultId }).update({ status: 'unlocked' });
    await database('vaults').where({ id: unlockedVaultId }).update({ status: 'closed' });

    const blockedVaultId = randomUUID();
    await database('vaults').insert({ id: blockedVaultId, user_id: userId, name: 'blocked', target_minor: 100 });
    await expect(database('vaults').where({ id: blockedVaultId }).update({ status: 'broken' })).rejects.toThrow();

    const penaltyVaultId = randomUUID();
    await database('vaults').insert({
      id: penaltyVaultId,
      user_id: userId,
      name: 'penalty',
      target_minor: 100,
      early_withdrawal_policy: 'penalty',
      penalty_rate_bps: 100,
    });
    await database('vaults').where({ id: penaltyVaultId }).update({ status: 'broken' });
    await expect(database('vaults').where({ id: penaltyVaultId }).update({ penalty_rate_bps: 200 }))
      .rejects.toThrow();
  });

  it('rejects cross-user account and transaction relationships', async () => {
    const first = await createUserWallet();
    const second = await createUserWallet();
    await expect(database('ledger_accounts').insert({
      account_type: 'wallet',
      user_id: first.userId,
      wallet_id: second.walletId,
    })).rejects.toThrow();
    await expect(database('transactions').insert({
      user_id: first.userId,
      wallet_id: second.walletId,
      type: 'deposit',
      status: 'pending',
      amount_minor: 100,
      idempotency_key: `cross-user-${randomUUID()}`,
    })).rejects.toThrow();
    await expect(database('wallets').where({ id: first.walletId }).update({ user_id: second.userId }))
      .rejects.toThrow();
  });
});
