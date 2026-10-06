import { useEffect, useState, type FormEvent } from 'react';
import { api, type Withdrawal } from '../api/client';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';

function kes(minor: string): string {
  const value = BigInt(minor);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, '0');
  return `KES ${sign}${whole.toString()}.${cents}`;
}

function parseAmountToMinor(value: string): string | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return (BigInt(match[1]) * 100n + BigInt(fraction || '0')).toString();
}

function statusBadge(status: string): JSX.Element {
  const colors: Record<string, string> = {
    pending: 'badge-pending',
    processing: 'badge-processing',
    succeeded: 'badge-success',
    failed: 'badge-failed',
    requires_reconciliation: 'badge-warning',
    requires_review: 'badge-warning',
    cancelled: 'badge-cancelled',
  };
  return <span className={`badge ${colors[status] ?? ''}`}>{status}</span>;
}

export function WithdrawalsPage(): JSX.Element {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[] | null>(null);
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const response = await api.getWithdrawals();
      setWithdrawals(response.withdrawals);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load withdrawals.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const amountMinor = parseAmountToMinor(amount);
    if (!amountMinor || BigInt(amountMinor) <= 0n) {
      setError('Enter a positive KES amount with at most two decimal places.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.createWithdrawal(amountMinor, phone, `withdrawal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      setWithdrawals((current) => current ? [response.withdrawal, ...current] : [response.withdrawal]);
      setMessage('Withdrawal request submitted. Awaiting M-Pesa confirmation.');
      setAmount('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start the withdrawal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcile = async (withdrawalId: string, receiptNumber: string) => {
    if (!receiptNumber.trim()) return;
    setError(null);
    setMessage(null);
    try {
      const response = await api.reconcileWithdrawal(withdrawalId, receiptNumber);
      setWithdrawals((current) => current?.map((w) => (w.id === withdrawalId ? response.withdrawal : w)) ?? []);
      setMessage('Withdrawal reconciled successfully.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reconcile withdrawal.');
    }
  };

  if (!withdrawals && !error) return <LoadingState label="Loading withdrawals…" />;

  return (
    <>
      <PageHeader eyebrow="Withdrawals" title="M-Pesa withdrawals" description="Withdraw funds from your wallet to M-Pesa. Sandbox only - no live money." />
      {error ? <Alert>{error}</Alert> : null}
      {message ? <div className="success-alert">{message}</div> : null}
      <Card>
        <h2>Start a withdrawal</h2>
        <p className="muted">Withdrawals use the Daraja sandbox and remain pending until Safaricom sends the callback. No live-money B2C withdrawals are connected.</p>
        <form onSubmit={submit}>
          <FormField label="Amount (KES)" name="amount" inputProps={{ inputMode: 'decimal', value: amount, onChange: (event) => setAmount(event.target.value), required: true, placeholder: '100.00' }} />
          <FormField label="Phone number" name="withdrawal-phone" inputProps={{ type: 'tel', value: phone, onChange: (event) => setPhone(event.target.value), required: true, placeholder: '0712 345 678' }} />
          <Button type="submit" isLoading={submitting}>Start withdrawal</Button>
        </form>
      </Card>
      <Card>
        <h2>Withdrawal history</h2>
        {withdrawals?.length === 0 ? <p className="muted">No withdrawals yet.</p> : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Withdrawal history</caption>
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Phone</th>
                  <th>Provider Ref</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals?.map((withdrawal) => (
                  <tr key={withdrawal.id}>
                    <td>{kes(withdrawal.amountMinor)}</td>
                    <td>{statusBadge(withdrawal.status)}</td>
                    <td>{withdrawal.phoneE164}</td>
                    <td>{withdrawal.providerReference ?? '-'}</td>
                    <td>{new Date(withdrawal.createdAt).toLocaleString()}</td>
                    <td>
                      {withdrawal.status !== 'succeeded' && (
                        <ReconcileForm withdrawalId={withdrawal.id} onReconcile={handleReconcile} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ReconcileForm({ withdrawalId, onReconcile }: { withdrawalId: string; onReconcile: (id: string, receipt: string) => Promise<void> }): JSX.Element {
  const [receipt, setReceipt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (receipt.trim()) {
          setSubmitting(true);
          onReconcile(withdrawalId, receipt).finally(() => setSubmitting(false));
        }
      }}
    >
      <input type="text" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="Receipt #" style={{ width: '120px', marginRight: '8px' }} />
      <Button type="submit" isLoading={submitting} variant="secondary">Reconcile</Button>
    </form>
  );
}