import { useEffect, useState, type FormEvent } from 'react';
import { api, type Deposit, type Wallet, reconcileDeposit } from '../api/client';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { NavLink } from 'react-router-dom';

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

export function WalletPage(): JSX.Element {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [walletResponse, depositsResponse] = await Promise.all([api.getWallet(), api.getDeposits()]);
    setWallet(walletResponse.wallet);
    setDeposits(depositsResponse.deposits);
  };

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load wallet data.'));
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
      const response = await api.createDeposit(amountMinor, phone, `web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      setDeposits((current) => [response.deposit, ...current.filter((item) => item.id !== response.deposit.id)]);
      setMessage('Deposit request accepted by the development payment simulator.');
      setAmount('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start the deposit.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcile = async (depositId: string, receiptNumber: string) => {
    if (!receiptNumber.trim()) return;
    setError(null);
    setMessage(null);
    try {
      const response = await reconcileDeposit(depositId, receiptNumber);
      setDeposits((current) => current.map((d) => (d.id === depositId ? response.deposit : d)));
      setMessage('Deposit reconciled successfully.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reconcile deposit.');
    }
  };

  if (!wallet && !error) return <LoadingState label="Loading your wallet…" />;

  return (
    <>
      <PageHeader eyebrow="Wallet" title="Your wallet" description="View your verified balance and start a development-only simulated deposit." />
      {error ? <Alert>{error}</Alert> : null}
      {message ? <div className="success-alert">{message}</div> : null}
      {wallet ? (
        <div className="dashboard-grid">
          <Card>
            <h2>Available balance</h2>
            <p className="balance-value">{kes(wallet.availableMinor)}</p>
            <dl className="profile-list">
              <div><dt>Pending</dt><dd>{kes(wallet.pendingMinor)}</dd></div>
              <div><dt>Locked</dt><dd>{kes(wallet.lockedMinor)}</dd></div>
              <div><dt>Status</dt><dd>{wallet.status}</dd></div>
            </dl>
          </Card>
          <Card>
            <h2>Start a deposit</h2>
            <p className="muted">Deposits use the Daraja sandbox and remain pending until Safaricom sends the real callback. No live-money provider, B2C, or withdrawals are connected.</p>
            <form onSubmit={submit}>
              <FormField label="Amount (KES)" name="amount" inputProps={{ inputMode: 'decimal', value: amount, onChange: (event) => setAmount(event.target.value), required: true, placeholder: '100.00' }} />
              <FormField label="Phone number" name="deposit-phone" inputProps={{ type: 'tel', value: phone, onChange: (event) => setPhone(event.target.value), required: true, placeholder: '0712 345 678' }} />
              <Button type="submit" isLoading={submitting}>Start deposit</Button>
            </form>
          </Card>
        </div>
      ) : null}
      <Card>
        <h2>Deposit history</h2>
        {deposits.length === 0 ? <p className="muted">No deposits yet.</p> : (
          <div className="table-wrap"><table><caption className="sr-only">Deposit history</caption><thead><tr><th>Amount</th><th>Status</th><th>Provider</th><th>Date</th></tr></thead><tbody>
            {deposits.map((deposit) => <tr key={deposit.id}><td>{kes(deposit.amountMinor)}</td><td>{deposit.status}</td><td>{deposit.provider}</td><td>{new Date(deposit.createdAt).toLocaleString()}</td></tr>)}
          </tbody></table></div>
        )}
      </Card>
    </>
  );
}
