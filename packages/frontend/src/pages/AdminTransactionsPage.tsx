import { useEffect, useState } from 'react';
import { api, type AdminTransaction } from '../api/client';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';

export function AdminTransactionsPage(): JSX.Element {
  const [transactions, setTransactions] = useState<AdminTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getAdminTransactions()
      .then((response) => setTransactions(response.transactions))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load transactions.'));
  }, []);
  return <>
    <PageHeader eyebrow="Operations" title="Transactions" description="Read-only transaction records returned by the authorized operations API." />
    {error ? <Alert>{error}</Alert> : null}
    {transactions === null && !error ? <LoadingState label="Loading transactions…" /> : null}
    {transactions?.length === 0 ? <Card><p className="muted">No transaction records were returned.</p></Card> : null}
    {transactions && transactions.length > 0 ? <Card><div className="table-wrap"><table><caption className="sr-only">Platform transactions</caption><thead><tr><th>Type</th><th>Status</th><th>Amount</th><th>Created</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.type}</td><td>{transaction.status}</td><td>{transaction.currency} {(transaction.amountMinor / 100).toFixed(2)}</td><td>{new Date(transaction.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div></Card> : null}
  </>;
}
