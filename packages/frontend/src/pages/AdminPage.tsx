import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminDashboard } from '../api/client';
import { Alert } from '../components/ui/Alert';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';

export function AdminPage(): JSX.Element {
  const [statistics, setStatistics] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getAdminDashboard()
      .then((response) => setStatistics(response.statistics))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load administrator data.'));
  }, []);
  return (
    <>
      <PageHeader eyebrow="Operations" title="Admin workspace" description="Operational visibility without unrestricted financial power." />
      {error ? <Alert>{error}</Alert> : null}
      {!statistics && !error ? <LoadingState label="Loading administrator data…" /> : null}
      <div className="dashboard-grid">
        {statistics ? <Card><h2>Platform overview</h2><dl className="profile-list"><div><dt>Registered users</dt><dd>{statistics.users}</dd></div><div><dt>Active sessions</dt><dd>{statistics.activeSessions}</dd></div></dl></Card> : null}
        <Card><h2>Read-only operations</h2><p className="muted">Review users and transactions without editing or deleting financial records.</p><div className="actions"><Link className="button button-secondary" to="/admin/users">Review users</Link><Link className="button button-secondary" to="/admin/transactions">View transactions</Link></div></Card>
      </div>
    </>
  );
}
