import { randomUUID } from 'node:crypto';
import fc from 'fast-check';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMigrationDatabaseConfig } from '../config/database.js';
import { Money } from '../domain/money.js';
import { postDeposit, postReversal, postTransfer } from '../domain/ledger.js';

const database = knex(getMigrationDatabaseConfig());
type Operation = { kind: 'deposit' | 'transfer' | 'reversal'; amount: number };

async function account(trx: Knex.Transaction, walletId: string): Promise<string> {
  const [id] = await trx('ledger_accounts').insert({
    account_type: 'wallet',
    wallet_id: walletId,
    user_id: (await trx('wallets').where({ id: walletId }).first()).user_id,
  }).returning('id');
  return typeof id === 'string' ? id : id.id;
}

describe('financial invariants under random PostgreSQL operations', () => {
  beforeAll(async () => {
    await database.migrate.latest();
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('preserves balanced journals, projections, and total money across operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            kind: fc.constantFrom<Operation['kind']>('deposit', 'transfer', 'reversal'),
            amount: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        async (operations) => {
          const result = await database.transaction(async (trx) => {
            const userA = randomUUID();
            const userB = randomUUID();
            await trx('users').insert([
              { id: userA, phone_e164: `+254${randomUUID().replaceAll('-', '').slice(0, 12)}` },
              { id: userB, phone_e164: `+254${randomUUID().replaceAll('-', '').slice(0, 12)}` },
            ]);
            const walletA = randomUUID();
            const walletB = randomUUID();
            await trx('wallets').insert([{ id: walletA, user_id: userA }, { id: walletB, user_id: userB }]);
            const accountA = await account(trx, walletA);
            const accountB = await account(trx, walletB);
            const clearing = randomUUID();
            await trx('ledger_accounts').insert({ id: clearing, account_type: 'clearing' });
            const entries: string[] = [];

            for (const [index, operation] of operations.entries()) {
              const amount = Money.fromMinor(BigInt(operation.amount));
              if (operation.kind === 'deposit') {
                entries.push(await postDeposit(trx, `property-deposit-${index}-${randomUUID()}`, accountA, clearing, amount));
              } else if (operation.kind === 'transfer') {
                const wallet = await trx('wallets').where({ id: walletA }).first();
                if (wallet.available_minor >= operation.amount) {
                  try {
                    entries.push(await postTransfer(trx, `property-transfer-${index}-${randomUUID()}`, accountA, accountB, amount));
                  } catch (error) {
                    if (!(error instanceof RangeError)) throw error;
                  }
                }
              } else if (entries.length > 0) {
                try {
                  entries.push(await postReversal(trx, `property-reversal-${index}-${randomUUID()}`, entries[0]));
                } catch (error) {
                  if (!(error instanceof RangeError) &&
                      !(error instanceof Error && error.message.includes('has already been reversed'))) {
                    throw error;
                  }
                }
              }
            }

            const unbalanced = await trx('journal_entries as e')
              .leftJoin('journal_lines as l', 'l.journal_entry_id', 'e.id')
              .groupBy('e.id')
              .havingRaw('COALESCE(SUM(l.debit_minor), 0) <> COALESCE(SUM(l.credit_minor), 0)')
              .count();
            const projections = await trx('wallets').whereIn('id', [walletA, walletB]);
            const walletAccounts = await trx('ledger_accounts').whereIn('id', [accountA, accountB]);
            return { unbalanced: Number(unbalanced[0]?.count ?? 0), projections, walletAccounts };
          });

          expect(result.unbalanced).toBe(0);
          for (const projection of result.projections) {
            expect(BigInt(projection.available_minor)).toBeGreaterThanOrEqual(0n);
          }
          for (const accountProjection of result.walletAccounts) {
            expect(BigInt(accountProjection.balance_minor)).toBeGreaterThanOrEqual(0n);
          }
          expect(result.projections.reduce((sum, wallet) => sum + BigInt(wallet.available_minor), 0n))
            .toBe(result.walletAccounts.reduce((sum, ledger) => sum + BigInt(ledger.balance_minor), 0n));
        },
      ),
      { numRuns: 20 },
    );
  });
});
