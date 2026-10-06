import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../auth/AuthContext';

export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  return <><PageHeader eyebrow="Your overview" title={`Hello${user?.displayName ? `, ${user.displayName}` : ''}.`} description="Your account workspace shows verified information from your Pochi Langu account." />
    <div className="dashboard-grid">
      <Card><h2>Account</h2><dl className="profile-list"><div><dt>Name</dt><dd>{user?.displayName ?? 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{user?.phone}</dd></div><div><dt>Role</dt><dd>{user?.role === 'admin' ? 'Administrator' : 'User'}</dd></div></dl></Card>
      <Card><h2>Financial information</h2><p className="muted">Balances, savings, and transactions will appear here only when verified read APIs are connected. No financial values are being estimated.</p></Card>
    </div></>;
}
