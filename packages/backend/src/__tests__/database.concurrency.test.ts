import { randomUUID } from 'node:crypto';
import knex from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMigrationDatabaseConfig } from '../config/database.js';
import { Money } from '../domain/money.js';
import { postDeposit, postReversal } from '../domain/ledger.js';

const database = knex(getMigrationDatabaseConfig());

describe('Phase 1 committed reversal concurrency', () => {
  beforeAll(async () => {
    await database.migrate.latest();
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('allows exactly one reversal when two committed transactions race', async () => {
    const userId = randomUUID();
    const walletId = randomUUID();
    const walletAccountId = randomUUID();
    const clearingAccountId = randomUUID();
    await database('users').insert({ id: userId, phone_e164: `+254${Date.now()}${Math.floor(Math.random() * 1000)}` });
    await database('wallets').insert({ id: walletId, user_id: userId });
    await database('ledger_accounts').insert([
      { id: walletAccountId, account_type: 'wallet', user_id: userId, wallet_id: walletId },
      { id: clearingAccountId, account_type: 'clearing' },
    ]);
    const originalId = await database.transaction((trx) =>
      postDeposit(trx, `concurrency-${randomUUID()}`, walletAccountId, clearingAccountId, Money.fromMinor(100n)));

    const first = database.transaction(async (trx) => postReversal(trx, `race-${randomUUID()}`, originalId));
    const second = database.transaction(async (trx) => postReversal(trx, `race-${randomUUID()}`, originalId));
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await database('journal_entries').where({ reversal_of_entry_id: originalId })).toHaveLength(1);
  });
});
