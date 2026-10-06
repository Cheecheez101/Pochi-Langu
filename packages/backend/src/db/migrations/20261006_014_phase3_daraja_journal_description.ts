import { up as redefineDepositFunction } from './20261006_012_phase3_deposit_column_qualification.js';
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await redefineDepositFunction(knex);
}

export async function down(_knex: Knex): Promise<void> {
  void _knex;
}
