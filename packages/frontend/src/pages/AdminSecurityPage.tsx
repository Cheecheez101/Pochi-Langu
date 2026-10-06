import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../auth/AuthContext';

export function AdminSecurityPage(): JSX.Element {
  const { user } = useAuth();
  return <>
    <PageHeader eyebrow="Operations / Security" title="Audit and security" description="Administrator access is enforced by the backend on every protected request." />
    <div className="dashboard-grid">
      <Card><h2>Current administrator</h2><dl className="profile-list"><div><dt>Name</dt><dd>{user?.displayName ?? 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{user?.phone}</dd></div><div><dt>Role</dt><dd>Administrator</dd></div></dl></Card>
      <Card><h2>Authorization boundary</h2><p className="muted">This portal exposes read-only operational views. The backend remains the final authorization boundary for users, transactions, and future audit records.</p></Card>
    </div>
  </>;
}
