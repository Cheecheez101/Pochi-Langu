import { useEffect, useState, type FormEvent } from 'react';
import { api, type SavingsGoal } from '../api/client';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';

function kes(value: string): string {
  const minor = BigInt(value);
  return `KES ${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
}
function minor(value: string): string | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  return match ? (BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')).toString() : null;
}

export function SavingsPage(): JSX.Element {
  const [goals, setGoals] = useState<SavingsGoal[] | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => api.getSavingsGoals().then((response) => setGoals(response.goals));
  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load savings goals.')); }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const targetMinor = minor(target);
    if (!name.trim() || !targetMinor || BigInt(targetMinor) <= 0n) { setError('Enter a name and positive target.'); return; }
    try { await api.createSavingsGoal({ name, description: '', targetMinor, lockUntil: null }); setName(''); setTarget(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create savings goal.'); }
  };
  if (!goals && !error) return <LoadingState label="Loading savings goals…" />;
  return <>
    <PageHeader eyebrow="Savings" title="Savings goals" description="Create goals and move funds between your wallet and internal savings accounts." />
    {error ? <Alert>{error}</Alert> : null}
    <Card><h2>New savings goal</h2><form onSubmit={create}>
      <FormField label="Goal name" name="goal-name" inputProps={{ value: name, onChange: (event) => setName(event.target.value), required: true, placeholder: 'Emergency fund' }} />
      <FormField label="Target (KES)" name="goal-target" inputProps={{ value: target, onChange: (event) => setTarget(event.target.value), required: true, placeholder: '10000.00' }} />
      <Button type="submit">Create goal</Button>
    </form></Card>
    <div className="dashboard-grid">{goals?.map((goal) => {
      const progress = Number((BigInt(goal.balanceMinor) * 100n) / BigInt(goal.targetMinor));
      return <Card key={goal.id}><h2>{goal.name}</h2><p className="balance-value">{kes(goal.balanceMinor)}</p><p className="muted">Target {kes(goal.targetMinor)} · {Math.min(progress, 100)}% complete</p><p className="muted">Status: {goal.status}{goal.lockUntil ? ` · locked until ${new Date(goal.lockUntil).toLocaleDateString()}` : ''}</p></Card>;
    })}</div>
  </>;
}
