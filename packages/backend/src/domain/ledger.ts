import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { Money } from './money.js';

type JournalLine = {
  ledger_account_id: string;
  debit_minor: string;
  credit_minor: string;
};

async function adjust(
  trx: Knex.Transaction,
  table: string,
  id: string,
  column: string,
  delta: bigint,
): Promise<void> {
  await trx(table).where({ id }).update({
    [column]: trx.raw('?? + ?::bigint', [column, delta.toString()]),
  });
}

async function appendEntry(
  trx: Knex.Transaction,
  sourceType: string,
  sourceReference: string,
  lines: JournalLine[],
  reversalOfEntryId?: string,
): Promise<string> {
  if (lines.length < 2 || lines.reduce((total, line) => total + BigInt(line.debit_minor), 0n) !==
      lines.reduce((total, line) => total + BigInt(line.credit_minor), 0n)) {
    throw new Error('Journal entry must be balanced and contain at least two lines');
  }
  const entryId = randomUUID();
  await trx('journal_entries').insert({
    id: entryId,
    entry_kind: reversalOfEntryId ? 'reversal' : 'original',
    source_type: sourceType,
    source_reference: sourceReference,
    reversal_of_entry_id: reversalOfEntryId ?? null,
    description: `${sourceType}:${sourceReference}`,
  });
  await trx('journal_lines').insert(lines.map((line) => ({ ...line, journal_entry_id: entryId })));
  for (const line of lines) {
    const delta = BigInt(line.debit_minor) - BigInt(line.credit_minor);
    await adjust(trx, 'ledger_accounts', line.ledger_account_id, 'balance_minor', delta);
  }
  return entryId;
}

export async function postDeposit(
  trx: Knex.Transaction,
  reference: string,
  walletAccountId: string,
  clearingAccountId: string,
  amount: Money,
): Promise<string> {
  if (amount.isNegative() || amount.isZero()) {
    throw new RangeError('Deposit amount must be positive');
  }
  const minor = amount.minor.toString();
  const entryId = await appendEntry(trx, 'deposit', reference, [
    { ledger_account_id: walletAccountId, debit_minor: minor, credit_minor: '0' },
    { ledger_account_id: clearingAccountId, debit_minor: '0', credit_minor: minor },
  ]);
  const wallet = await trx('ledger_accounts').where({ id: walletAccountId }).first();
  if (!wallet?.wallet_id) throw new Error('Wallet ledger account is not linked to a wallet');
  await adjust(trx, 'wallets', wallet.wallet_id, 'available_minor', amount.minor);
  return entryId;
}

export async function postTransfer(
  trx: Knex.Transaction,
  reference: string,
  sourceWalletAccountId: string,
  destinationWalletAccountId: string,
  amount: Money,
): Promise<string> {
  if (amount.isNegative() || amount.isZero()) {
    throw new RangeError('Transfer amount must be positive');
  }
  const minor = amount.minor.toString();
  const source = await trx('ledger_accounts').where({ id: sourceWalletAccountId }).first();
  const destination = await trx('ledger_accounts').where({ id: destinationWalletAccountId }).first();
  if (!source || !destination || source.user_id !== destination.user_id) {
    throw new RangeError('Transfer accounts must belong to the same user');
  }
  if (BigInt(source.balance_minor) < amount.minor) {
    throw new RangeError('Transfer would overdraw the source wallet');
  }
  const entryId = await appendEntry(trx, 'transfer', reference, [
    { ledger_account_id: sourceWalletAccountId, debit_minor: '0', credit_minor: minor },
    { ledger_account_id: destinationWalletAccountId, debit_minor: minor, credit_minor: '0' },
  ]);
  const sourceWallet = await trx('ledger_accounts').where({ id: sourceWalletAccountId }).first();
  const destinationWallet = destination;
  if (!sourceWallet?.wallet_id || !destinationWallet?.wallet_id) {
    throw new Error('Transfer accounts must be linked to wallets');
  }
  await adjust(trx, 'wallets', sourceWallet.wallet_id, 'available_minor', -amount.minor);
  await adjust(trx, 'wallets', destinationWallet.wallet_id, 'available_minor', amount.minor);
  return entryId;
}

export async function postReversal(
  trx: Knex.Transaction,
  reference: string,
  originalEntryId: string,
): Promise<string> {
  const existingReversal = await trx('journal_entries')
    .where({ reversal_of_entry_id: originalEntryId })
    .forUpdate()
    .first();
  if (existingReversal) {
    throw new Error(`Journal entry ${originalEntryId} has already been reversed`);
  }
  const lines = await trx('journal_lines').where({ journal_entry_id: originalEntryId });
  if (lines.length === 0) {
    throw new Error('Cannot reverse a journal entry with no lines');
  }
  const reversalLines = lines.map((line) => ({
    ledger_account_id: line.ledger_account_id,
    debit_minor: String(line.credit_minor),
    credit_minor: String(line.debit_minor),
  }));
  for (const line of reversalLines) {
    const account = await trx('ledger_accounts').where({ id: line.ledger_account_id }).first();
    if (account?.wallet_id) {
      const wallet = await trx('wallets').where({ id: account.wallet_id }).first();
      const delta = BigInt(line.debit_minor) - BigInt(line.credit_minor);
      if (!wallet || BigInt(wallet.available_minor) + delta < 0n) {
        throw new RangeError('Reversal would make a wallet projection negative');
      }
    }
  }
  const entryId = await appendEntry(trx, 'reversal', reference, reversalLines, originalEntryId);
  for (const line of lines) {
    const delta = BigInt(line.credit_minor) - BigInt(line.debit_minor);
    const account = await trx('ledger_accounts').where({ id: line.ledger_account_id }).first();
    if (account?.wallet_id) {
      await adjust(trx, 'wallets', account.wallet_id, 'available_minor', delta);
    }
  }
  return entryId;
}
